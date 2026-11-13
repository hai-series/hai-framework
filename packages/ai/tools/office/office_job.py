"""通过独立 LibreOffice profile 和本地 UNO 管道运行单个作业。"""
import pathlib
import subprocess
import sys
import time
import uuid
import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.connection import NoConnectException
from com.sun.star.document.MacroExecMode import NEVER_EXECUTE
from com.sun.star.document.UpdateDocMode import NO_UPDATE


def property_value(name, value):
    item = PropertyValue()
    item.Name = name
    item.Value = value
    return item


def main():
    source, result, output_filter, operation = sys.argv[1:]
    context = uno.getComponentContext()
    resolver = context.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', context)
    pipe = 'hai_' + uuid.uuid4().hex
    address = 'pipe,name=' + pipe + ';urp;StarOffice.ComponentContext'
    profile = (pathlib.Path.cwd() / 'profile').as_uri()
    with subprocess.Popen([
        '/usr/bin/libreoffice', '-env:UserInstallation=' + profile,
        '--headless', '--nologo', '--norestore', '--nodefault', '--nofirststartwizard', '--accept=' + address,
    ]) as process:
        try:
            deadline = time.monotonic() + 10
            while True:
                try:
                    remote = resolver.resolve('uno:' + address)
                    break
                except NoConnectException:
                    if time.monotonic() >= deadline or process.poll() is not None:
                        raise
                    time.sleep(0.05)
            desktop = remote.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', remote)
            document = desktop.loadComponentFromURL(pathlib.Path(source).as_uri(), '_blank', 0, (
                property_value('Hidden', True),
                property_value('ReadOnly', True),
                property_value('MacroExecutionMode', NEVER_EXECUTE),
                property_value('UpdateDocMode', NO_UPDATE),
            ))
            if document is None:
                raise RuntimeError('Unable to load office document')
            try:
                if operation == 'recalculate':
                    document.calculateAll()
                document.storeToURL(pathlib.Path(result).as_uri(), (property_value('FilterName', output_filter),))
            finally:
                document.dispose()
            desktop.terminate()
            process.wait(timeout=3)
        finally:
            if process.poll() is None:
                process.kill()


if __name__ == '__main__':
    main()
