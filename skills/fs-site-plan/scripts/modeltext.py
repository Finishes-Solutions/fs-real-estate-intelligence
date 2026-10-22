"""The project model printed on the sheet as invisible text, between FS-MODEL BEGIN / END lines. Some agent platforms
hand an agent only a PDF's text, not the file: the model then still arrives, and read_model.py rebuilds it from the
text. Lines break only after a comma outside a string, and each is wrapped as <<FS:nnnn:...:FS>>, so the model comes
back whatever order an extractor puts the lines in or whatever text it runs them into."""
import io
import json

BEGIN, END = 'FS-MODEL BEGIN (machine-readable project model; read_model.py rebuilds it)', 'FS-MODEL END'


def lines_of(model, width=280):
    s = json.dumps(model, separators=(',', ':'), ensure_ascii=True)
    out, cur, in_str, esc = [], [], False, False
    for ch in s:
        cur.append(ch)
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == ',' and len(cur) >= width:
            out.append(''.join(cur))
            cur = []
    if cur:
        out.append(''.join(cur))
    return out


def stamp(pdf_path, model, page=0):
    """overlays the model as invisible (render mode 3) 2 pt text down the left margin of one page"""
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas
    r = PdfReader(pdf_path)
    pg = r.pages[page]
    W, H = float(pg.mediabox.width), float(pg.mediabox.height)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    # 2.5 pt text on a 5 pt leading: far enough apart that every extractor keeps the lines separate; columns as needed
    rows = [BEGIN] + ['<<FS:%04d:%s:FS>>' % (i, ln) for i, ln in enumerate(lines_of(model))] + [END]
    per = int((H - 80) / 5)
    for k in range(0, len(rows), per):
        t = c.beginText()
        t.setTextRenderMode(3)
        t.setFont('Helvetica', 2.5)
        t.setLeading(5)
        t.setTextOrigin(40 + (k // per) * 470, H - 40)
        for ln in rows[k:k + per]:
            t.textLine(ln)
        c.drawText(t)
    c.save()
    w = PdfWriter(clone_from=r)
    w.pages[page].merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
    with open(pdf_path, 'wb') as f:
        w.write(f)


def parse(text):
    """the model from a PDF's text (or None): the numbered pieces put back in order, line breaks an extractor added
    inside a piece dropped"""
    import re
    parts = re.findall(r'<<FS:(\d{4}):(.*?):FS>>', text, re.S)
    if not parts:
        return None
    body = ''.join(p.replace('\r', '').replace('\n', '') for _, p in sorted(parts, key=lambda x: int(x[0])))
    return json.loads(body)
