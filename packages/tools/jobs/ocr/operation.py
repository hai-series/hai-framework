from tool import ToolError, read_text, run_command

LANGUAGES = {'eng', 'chi_sim', 'jpn', 'eng+chi_sim', 'eng+jpn'}


def recognize(request, source, _artifact, workspace):
    language = request.get('language', 'eng')
    if not isinstance(language, str) or language not in LANGUAGES:
        raise ToolError('INVALID_REQUEST', 'Unsupported OCR language')
    with source.open('rb') as stream:
        header = stream.read(8)
    if not (header.startswith(b'\x89PNG\r\n\x1a\n') or header.startswith(b'\xff\xd8\xff') or header.startswith((b'II*\0', b'MM\0*'))):
        raise ToolError('INVALID_INPUT', 'Expected a PNG, JPEG or TIFF image')
    run_command(['/usr/bin/tesseract', str(source), str(workspace / 'result'), '-l', language], 60, workspace)
    return read_text(workspace / 'result.txt')


commands = {'ocr.recognize': ({'input'}, {'language'}, recognize)}
