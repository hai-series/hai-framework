import pathlib
import xml.etree.ElementTree as ET
import zipfile
from archives import OfficeArchive, office_archive_error
from tool import ToolError, publish, run_command


PDF_FILTERS = {
    '.docx': 'writer_pdf_Export', '.odt': 'writer_pdf_Export',
    '.xlsx': 'calc_pdf_Export', '.ods': 'calc_pdf_Export',
    '.pptx': 'impress_pdf_Export', '.odp': 'impress_pdf_Export',
}
SHEET_FILTERS = {'.xlsx': 'Calc MS Excel 2007 XML', '.ods': 'calc8'}


def process(request, source, artifact, workspace):
    suffix = source.suffix.lower()
    convert = request['operation'] == 'office.convert'
    if convert:
        if suffix not in PDF_FILTERS or artifact.suffix.lower() != '.pdf':
            raise ToolError('INVALID_REQUEST', 'Conversion requires a supported office document and PDF output')
        output_filter = PDF_FILTERS[suffix]
        signature = b'%PDF-'
    else:
        if suffix not in SHEET_FILTERS or artifact.suffix.lower() != suffix:
            raise ToolError('INVALID_REQUEST', 'Recalculation requires matching XLSX or ODS input and output')
        output_filter = SHEET_FILTERS[suffix]
        signature = b'PK\x03\x04'
    try:
        with OfficeArchive(source) as document:
            document.reject_external_links()
    except (zipfile.BadZipFile, KeyError, ValueError, ET.ParseError):
        raise office_archive_error() from None
    result = workspace / artifact.name
    worker = pathlib.Path(__file__).with_name('office_job.py')
    run_command(['/usr/bin/python3', str(worker), str(source), str(result), output_filter, 'convert' if convert else 'recalculate'], 90, workspace)
    return publish(result, artifact, signature)


commands = {
    'office.convert': ({'input', 'output'}, set(), process),
    'office.recalculate': ({'input', 'output'}, set(), process),
}
