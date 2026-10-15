import { describe, expect, it } from 'vitest'
import { verifyEvidenceBlob } from '../../../server/features/costs/evidence/evidence-file-integrity'

const maxBytes = 25 * 1024 * 1024
const verify = (text: string, mimeType = 'application/xml') =>
  verifyEvidenceBlob(new Blob([new TextEncoder().encode(text)], { type: mimeType }), maxBytes, mimeType)

// Shape of a Vietnamese e-invoice (hóa đơn điện tử, Decision 1450/TT78): Vietnamese text and an XML-DSig signature.
const vietnameseInvoice = `<?xml version="1.0" encoding="UTF-8"?>
<HDon>
  <DLHDon Id="data">
    <TTChung><PBan>2.0.1</PBan><THDon>Hóa đơn giá trị gia tăng</THDon><KHMSHDon>1</KHMSHDon><KHHDon>C26TAA</KHHDon><SHDon>123</SHDon><NLap>2026-10-11</NLap><DVTTe>VND</DVTTe></TTChung>
    <NDHDon>
      <NBan><Ten>Công ty TNHH Thép Hòa Phát</Ten><MST>0101234567</MST><DChi>Số 1, đường Nguyễn Trãi, Hà Nội</DChi></NBan>
      <NMua><Ten>Công ty Cổ phần Xây dựng VQH</Ten><MST>0109876543</MST></NMua>
      <DSHHDVu><HHDVu><STT>1</STT><THHDVu>Thép cuộn D10 &amp; phụ kiện</THHDVu><DVTinh>kg</DVTinh><SLuong>1000</SLuong><DGia>18500</DGia><ThTien>18500000</ThTien><TSuat>10%</TSuat></HHDVu></DSHHDVu>
      <TToan><TgTCThue>18500000</TgTCThue><TgTThue>1850000</TgTThue><TgTTTBSo>20350000</TgTTTBSo><TgTTTBChu>Hai mươi triệu ba trăm năm mươi nghìn đồng</TgTTTBChu></TToan>
    </NDHDon>
  </DLHDon>
  <DSCKS><NBan><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI="#data"/></SignedInfo><SignatureValue>AbC=</SignatureValue></Signature></NBan></DSCKS>
</HDon>`

const mismatch = { statusCode: 409, code: 'EVIDENCE_UPLOAD_MISMATCH' }
const verifyBytes = (bytes: Uint8Array) =>
  verifyEvidenceBlob(new Blob([bytes], { type: 'application/xml' }), maxBytes, 'application/xml')

describe('XML evidence integrity (allowlist)', () => {
  it('accepts a Vietnamese e-invoice for both XML MIME types', async () => {
    await expect(verify(vietnameseInvoice)).resolves.toMatchObject({ mimeType: 'application/xml' })
    await expect(verify(vietnameseInvoice, 'text/xml')).resolves.toMatchObject({ mimeType: 'text/xml' })
  })

  it.each([
    ['a bare HDon root after a BOM and whitespace', '\uFEFF \n<HDon><SHDon>1</SHDon></HDon>'],
    ['a self-closing root', '<?xml version="1.0" encoding="utf-8" standalone="yes"?><HDon/>'],
    ['a TDiep root with a comment and CDATA', '<?xml version="1.0"?>\n<TDiep><!-- gửi CQT --><DLieu><![CDATA[a < b]]></DLieu></TDiep>\n'],
    ['a prefixed Invoice root in the GDT namespace', '<inv:Invoice xmlns:inv="http://laphoadon.gdt.gov.vn/2014/09/invoicexml/v1"><inv:No>1</inv:No></inv:Invoice>'],
    ['escaped markup characters in text', '<HDon><Ten>Thép &lt; 10mm &amp; phụ kiện</Ten></HDon>'],
  ])('accepts %s', async (_label, text) => {
    await expect(verify(text)).resolves.toMatchObject({ mimeType: 'application/xml' })
  })

  it.each([
    ['plain text', 'Hóa đơn số 123'],
    ['a renamed PDF', '%PDF-1.7 pretending to be xml'],
    ['an unknown root element', '<?xml version="1.0"?><html><body/></html>'],
    ['an unknown root element that only starts like an allowed one', '<HDonX/>'],
    ['a leading comment before the root', '<!-- comment --><HDon/>'],
    ['an empty document', '   '],
    ['a second root element', '<HDon></HDon><svg></svg>'],
    ['trailing content after the root', '<HDon/>tail'],
    ['a root that is never closed', '<HDon><SHDon>1</SHDon>'],
    ['a non UTF-8 encoding declaration', '<?xml version="1.0" encoding="windows-1258"?><HDon/>'],
    ['a malformed XML declaration', '<?xml version="1.0" foo="bar"?><HDon/>'],
  ])('rejects %s', async (_label, text) => {
    await expect(verify(text)).rejects.toMatchObject(mismatch)
  })

  it.each([
    ['a DOCTYPE', '<?xml version="1.0"?><!DOCTYPE HDon SYSTEM "hdon.dtd"><HDon/>'],
    ['a DOCTYPE with an internal subset', '<?xml version="1.0"?><!doctype HDon [<!ELEMENT HDon ANY>]><HDon/>'],
    ['an entity declaration', '<?xml version="1.0"?><HDon><!ENTITY x "y"></HDon>'],
    ['an xml-stylesheet processing instruction', '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="x.xsl"?><HDon/>'],
    ['a processing instruction inside the root', '<HDon><?php echo 1 ?></HDon>'],
    ['the XHTML namespace', '<HDon><x:script xmlns:x="http://www.w3.org/1999/xhtml">alert(1)</x:script></HDon>'],
    ['the XHTML namespace as the default namespace', '<HDon xmlns="http://www.w3.org/1999/xhtml"/>'],
    ['the SVG namespace', '<HDon><svg xmlns = \'http://www.w3.org/2000/svg\' onload="alert(1)"/></HDon>'],
    ['the MathML namespace', '<HDon><math xmlns="http://www.w3.org/1998/Math/MathML"/></HDon>'],
    ['the XSLT namespace', '<HDon><xsl:template xmlns:xsl="http://www.w3.org/1999/XSL/Transform"/></HDon>'],
    ['a namespace hidden behind character references', '<HDon><a xmlns="http&#x3A;//www.w3.org/1999/xhtml"/></HDon>'],
    ['a namespace declaration without a quoted value', '<HDon><a xmlns=x/></HDon>'],
    ['an encoded &#x3C;script', '<HDon><Ten>&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;</Ten></HDon>'],
    ['an encoded &#60;script', '<HDon><Ten>&#60;script>alert(1)</Ten></HDon>'],
    ['a javascript: URL', '<HDon><a href="JavaScript:alert(1)">x</a></HDon>'],
  ])('rejects a document with %s', async (_label, text) => {
    await expect(verify(text)).rejects.toMatchObject(mismatch)
  })

  it('rejects UTF-16 documents, with or without a byte order mark', async () => {
    const utf16 = (text: string, bom: boolean) => {
      const body = Buffer.from(text, 'utf16le')
      return new Uint8Array(bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body)
    }
    await expect(verifyBytes(utf16('<?xml version="1.0" encoding="UTF-16"?><HDon/>', true))).rejects.toMatchObject(mismatch)
    await expect(verifyBytes(utf16('<HDon/>', false))).rejects.toMatchObject(mismatch)
  })

  it('rejects bytes that are not valid UTF-8', async () => {
    await expect(verifyBytes(new Uint8Array([...new TextEncoder().encode('<HDon>'), 0xc3, 0x28, ...new TextEncoder().encode('</HDon>')])))
      .rejects.toMatchObject(mismatch)
  })

  it('checks the whole document, not only the first 64 KiB', async () => {
    const padding = `<Ghi>${'a'.repeat(70 * 1024)}</Ghi>`
    await expect(verify(`<HDon>${padding}<x xmlns="http://www.w3.org/1999/xhtml"/></HDon>`)).rejects.toMatchObject(mismatch)
  })
})
