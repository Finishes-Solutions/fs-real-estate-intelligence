"""The OpenAI Images API, edit endpoint, with the standard library only (no SDK needed).

The key is read from, in order: the OPENAI_API_KEY environment variable, a file named by --key-file, or a key file
in the skill's own folder (`openai.key` holding just the key, or `.env` with a line OPENAI_API_KEY=...). It is sent
only to api.openai.com in the Authorization header and is never printed, logged or written anywhere."""
import http.client
import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
PREFERRED = 'gpt-image-2.5-sunburst'
SIZES = ['1920x1080', '1536x1024', '1024x1024']  # tried in this order when the model refuses a size
PRICES = {'gpt-image-1': (10, 2.5, 40), 'gpt-image-1-mini': (2.5, 0.625, 8), 'gpt-image-1.5': (8, 2, 32),
          'gpt-image-2.5-sunburst': (8, 2, 32), 'gpt-image-2': (8, 2, 32)}  # $ per 1M tokens (input, cached, output), from the app's table; estimates


class OpenAIError(Exception):
    def __init__(self, status, message):
        super().__init__('OpenAI %s: %s' % (status, message))
        self.status, self.message = status, message


SKILL_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _from_file(path):
    """the key from a file: the whole file (openai.key) or its OPENAI_API_KEY= line (.env)"""
    try:
        text = open(path).read()
    except OSError:
        return ''
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('export '):
            line = line[7:].strip()
        if line.startswith('OPENAI_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    return text.strip() if '=' not in text else ''


def get_key(key_file=None):
    """-> (key, where it came from). Never returns or prints anything but the source's name alongside the key."""
    k = os.environ.get('OPENAI_API_KEY', '').strip()
    if k:
        return k, 'the OPENAI_API_KEY environment variable'
    if key_file:
        k = _from_file(key_file)
        if k:
            return k, 'the --key-file'
    placeholder = None
    for name in ('openai.key', '.env'):
        k = _from_file(os.path.join(SKILL_DIR, name))
        if k and not k.startswith('sk-'):  # still the shipped placeholder (OpenAI keys start with sk-)
            placeholder = name
            continue
        if k:
            return k, 'the skill folder\'s %s' % name
    if placeholder:
        raise SystemExit('The skill folder\'s %s still holds the placeholder, not a key. The skill\'s owner replaces it with '
                         'the real key (see references/setup.md). Never paste the key into the chat.' % placeholder)
    raise SystemExit('No OpenAI key: set OPENAI_API_KEY, or put the key in the skill folder as openai.key (see '
                     'references/setup.md). Never paste the key into the chat.')


def key_status(key_file=None):
    """-> (ok, text) without raising and without the key: where a usable key is, or exactly why there is none"""
    try:
        _, src = get_key(key_file)
        return True, 'found (%s)' % src
    except SystemExit as e:
        return False, str(e)


def reachable(timeout=8):
    """-> (ok, text): can this sandbox reach the API at all (no key is sent; any HTTP answer means yes)"""
    try:
        urllib.request.urlopen(urllib.request.Request(BASE + '/models'), timeout=timeout)
        return True, 'reachable'
    except urllib.error.HTTPError:
        return True, 'reachable'
    except Exception as e:
        return False, 'not reachable from here (%s)' % (getattr(e, 'reason', None) or type(e).__name__)


def _request(req, timeout):
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode() or '{}')
        except Exception:
            body = {}
        return e.code, body
    except urllib.error.URLError as e:
        if isinstance(getattr(e, 'reason', None), (TimeoutError, ConnectionError)):
            return 'retry', {'error': {'message': str(e.reason)}}
        raise OpenAIError('network', '%s. Is api.openai.com allowed by this environment\'s network settings? (references/setup.md)' % e.reason)
    except (http.client.HTTPException, ConnectionError, TimeoutError) as e:  # a dropped or timed-out connection: try again
        return 'retry', {'error': {'message': '%s: %s' % (type(e).__name__, e)}}


def list_models(key, timeout=30):
    st, d = _request(urllib.request.Request(BASE + '/models', headers={'Authorization': 'Bearer ' + key}), timeout)
    if st != 200:
        raise OpenAIError(st, (d.get('error') or {}).get('message', 'could not list models'))
    return [m.get('id') for m in d.get('data', []) if m.get('id')]


def pick_image_model(ids, preferred=''):
    """the preferred model when the key lists it (or when nothing can be read); else the newest GPT Image model it
    lists by version (a named edition such as -sunburst edges out the plain one; never a mini or nano)"""
    want = preferred or PREFERRED
    if not ids or want in ids:
        return want

    def ver(i):
        m = re.match(r'^gpt-image-(\d+(?:\.\d+)?)(?:-(?!mini|nano)[a-z]+)?$', i)
        return float(m.group(1)) + (0.01 if re.search(r'-[a-z]+$', i) else 0) if m else None
    best = sorted([i for i in ids if ver(i) is not None], key=ver, reverse=True)
    return best[0] if best else want


def _multipart(fields, files):
    b = uuid.uuid4().hex
    out = bytearray()
    for k, v in fields:
        out += ('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (b, k, v)).encode()
    for k, name, data, mime in files:
        out += ('--%s\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\nContent-Type: %s\r\n\r\n' % (b, k, name, mime)).encode()
        out += data + b'\r\n'
    out += ('--%s--\r\n' % b).encode()
    return bytes(out), 'multipart/form-data; boundary=' + b


def edit(key, model, prompt, images, size='1920x1080', quality='high', fidelity=True, fmt='jpeg', timeout=600, tries=6):
    """images: [(filename, bytes, mime)], the first is the picture whose geometry and camera are kept.
    Returns dict(b64, size, model, usage). A refused size raises OpenAIError with status 'size' so the caller can
    re-render the massing at the next size (the picture's proportions must match)."""
    fid = fidelity
    last = None
    for i in range(tries):
        fields = [('model', model), ('prompt', prompt), ('n', '1'), ('size', size), ('quality', quality), ('output_format', fmt)]
        if fid:
            fields.append(('input_fidelity', 'high'))
        body, ctype = _multipart(fields, [('image[]', n, d, m) for n, d, m in images])
        req = urllib.request.Request(BASE + '/images/edits', data=body, method='POST',
                                     headers={'Authorization': 'Bearer ' + key, 'Content-Type': ctype})
        st, d = _request(req, timeout)
        if st == 'retry' or st == 429 or (isinstance(st, int) and st >= 500):
            last = OpenAIError(st, (d.get('error') or {}).get('message', 'busy'))
            time.sleep(3 * (i + 1))
            continue
        if st != 200:
            msg = (d.get('error') or {}).get('message', 'error')
            if st == 400 and 'input_fidelity' in msg.lower() and fid:
                fid = False
                continue
            if st == 400 and (size in msg or re.search(r'\bsize\b', msg, re.I)):
                raise OpenAIError('size', msg)
            raise OpenAIError(st, msg)
        item = (d.get('data') or [{}])[0]
        if not item.get('b64_json'):
            raise OpenAIError(st, 'no image in the answer')
        return dict(b64=item['b64_json'], size=size, model=d.get('model', model), usage=d.get('usage'), fidelity=fid)
    raise last or OpenAIError('retry', 'kept failing')


def cost_of(model, usage):
    """an estimate in dollars from the token counts, or None"""
    if not usage:
        return None
    p = PRICES.get(model) or PRICES.get(re.sub(r'-\d{4}-\d{2}-\d{2}$', '', model))
    if not p:
        return None
    inp = usage.get('input_tokens', 0)
    cached = (usage.get('input_tokens_details') or {}).get('cached_tokens', 0)
    out = usage.get('output_tokens', 0)
    return ((inp - cached) * p[0] + cached * p[1] + out * p[2]) / 1e6
