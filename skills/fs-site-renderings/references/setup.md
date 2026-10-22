# Setting up the OpenAI call

The renderings need two things where the agent runs:

1. **The key**, in the first of these the script finds: the `OPENAI_API_KEY` environment variable, a file named with
   `--key-file`, or a key file in the skill's own folder (`openai.key` holding just the key, or `.env` with
   `OPENAI_API_KEY=sk-…`). It sends the key only to `api.openai.com` in the request header and never prints or saves it.
2. **Network access to `api.openai.com`** (HTTPS, port 443).

Everything before the paid step (the massing, the references, the prompts) works without either, so you can check a project
first and set up the key afterwards.

**Never paste the key into a chat.** Conversations are stored. If a key has been pasted anywhere, rotate it in the OpenAI
dashboard.

## Claude Code on your own computer (terminal, desktop app, IDE)

Your computer's normal internet access applies. Put the key in the environment Claude Code starts from:

- macOS / Linux: add `export OPENAI_API_KEY="sk-…"` to `~/.zshrc` or `~/.bashrc`, open a new terminal, then start `claude`.
- Windows (PowerShell): `setx OPENAI_API_KEY "sk-…"`, then open a new terminal.
- Or, for Claude Code only, add it under `"env"` in your user settings file (`~/.claude/settings.json`). Never put it in a
  project's settings file that gets committed to git.

## Claude Code on the web (cloud environments)

Cloud environments only reach the hosts their network policy allows, and `api.openai.com` isn't usually one of them.
In the environment's settings (the cloud environment menu in the session's title bar, then **Edit**):

1. **Network access:** add `api.openai.com` under **Allowed domains** (keep "Allow package managers" ticked), or choose a
   broader access level. Steps: https://code.claude.com/docs/en/cloud-environments#network-access
2. **The key:** add `OPENAI_API_KEY` as an environment variable (or under Network secrets, where offered).
3. Start a **new session**: settings are read when a session starts.

## Claude apps with skills (claude.ai, Cowork)

The code there runs in a sandbox whose internet access is set by your organisation's code-execution settings. It may not be
able to reach `api.openai.com`, and there's no safe place to keep a key. If the run says it can't reach the API, do the
paid step in Claude Code instead, using the same skill and the same files.

## Agents on another platform: a key file inside the skill

When the platform running the agent can't set environment variables, put the key in the skill itself:

1. Unzip the skill, create `fs-site-renderings/openai.key` containing only the key (one line), zip it again and upload
   that copy to the platform. (`.env` with `OPENAI_API_KEY=sk-…` also works.)
2. Use a key made for this: in the OpenAI dashboard, a **separate project** with a **monthly budget limit**, and a
   **restricted key** that only allows the Images endpoint (plus Models, read only, so it can pick the model).
3. Keep that zip private. Anyone who can download the skill or see its files has the key; never commit it to git
   (this repository ignores `openai.key` and `.env` under `skills/`) and never post it in chat.
4. Rotate the key in the dashboard if the zip is shared further than intended or anything looks off in the usage.

The platform's sandbox must also be able to reach `api.openai.com`. Some sandboxes have no internet access at all (for
example code run through Anthropic's API code-execution tool); there a key file can't help, and the paid step needs a
platform that allows that host, or Claude Code.

## No network where the agent runs: the paint package

If the sandbox can't reach `api.openai.com`, the agent writes `paint-package.zip` (`render_views.py --package`): the
massing views at each size the model may take, the prompts, the references, `paint.py` and the API client. No key is in
it. On any computer with Python 3 and internet:

```
unzip paint-package.zip && cd paint-package
python3 paint.py              # the plan and the estimate
python3 paint.py --yes        # paints (key from OPENAI_API_KEY, or openai.key in this folder)
```

Zip the folder back up and give it to the agent (`render_views.py --import painted.zip`), which checks every picture
against its massing and makes the R-1 sheet. Only the standard library is needed for `paint.py`.

## Checking it

```
python3 -c "import os; print('key set' if os.environ.get('OPENAI_API_KEY') else 'no key')"
curl -s -o /dev/null -w "%{http_code}\n" https://api.openai.com/v1/models    # 401 = reachable (no key sent); 000 or a proxy error = blocked
```

If the key works but the model is missing, the run says which model it used instead. Access to newer image models can
depend on the OpenAI organisation's verification and usage tier, which you can see in the OpenAI dashboard.

## Cost

Each rendering is one Images edit call at high quality. Expect roughly **$0.20–0.50 a picture**. That's an estimate from
token counts, and OpenAI's pricing page is the authority. The run prints its own estimate from the usage OpenAI returns. A
full set of five plus a couple of re-paints is typically a few dollars.
