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

describe('XML evidence integrity', () => {
  it('accepts a Vietnamese e-invoice for both XML MIME types', async () => {
    await expect(verify(vietnameseInvoice)).resolves.toMatchObject({ mimeType: 'application/xml' })
    await expect(verify(vietnameseInvoice, 'text/xml')).resolves.toMatchObject({ mimeType: 'text/xml' })
  })

  it('accepts a document that starts directly with its root element after a BOM and whitespace', async () => {
    await expect(verify('\uFEFF \n<HDon><SHDon>1</SHDon></HDon>')).resolves.toMatchObject({ mimeType: 'application/xml' })
  })

  it('accepts a DOCTYPE without an internal subset', async () => {
    await expect(verify('<?xml version="1.0"?><!DOCTYPE HDon SYSTEM "hdon.dtd"><HDon/>')).resolves.toMatchObject({ mimeType: 'application/xml' })
  })

  it.each([
    ['plain text', 'Hóa đơn số 123'],
    ['a renamed PDF', '%PDF-1.7 pretending to be xml'],
    ['a tag name that does not start with a letter', '<1HDon/>'],
    ['a leading comment instead of the prolog or root', '<!-- comment --><HDon/>'],
    ['an empty document', '   '],
  ])('rejects %s without a well-formed XML start', async (_label, text) => {
    await expect(verify(text)).rejects.toMatchObject(mismatch)
  })

  it.each([
    ['the XHTML namespace', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body/></html>'],
    ['the XHTML namespace in upper case', '<?xml version="1.0"?><x:html xmlns:x="HTTP://WWW.W3.ORG/1999/XHTML"/>'],
    ['the SVG namespace', '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'],
    ['a script element', '<?xml version="1.0"?><HDon><script>alert(1)</script></HDon>'],
    ['a script element in mixed case', '<?xml version="1.0"?><HDon><ScRiPt>alert(1)</ScRiPt></HDon>'],
    ['a javascript: URL', '<?xml version="1.0"?><HDon><a href="JavaScript:alert(1)">x</a></HDon>'],
    ['an entity declaration', '<?xml version="1.0"?><!ENTITY x "y"><HDon/>'],
    ['a DOCTYPE with an internal subset', '<?xml version="1.0"?><!DOCTYPE HDon [<!ELEMENT HDon ANY>]><HDon/>'],
    ['a DOCTYPE with an internal subset in lower case', '<?xml version="1.0"?><!doctype HDon\n[ <!element HDon ANY> ]><HDon/>'],
    ['an xml-stylesheet processing instruction', '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="x.xsl"?><HDon/>'],
    ['an xml-stylesheet processing instruction in upper case', '<?xml version="1.0"?><?XML-STYLESHEET href="x.css"?><HDon/>'],
  ])('rejects a document with %s', async (_label, text) => {
    await expect(verify(text)).rejects.toMatchObject(mismatch)
  })

  it('rejects active content that appears after the first 64 KiB', async () => {
    const padding = `<Ghi>${'a'.repeat(70 * 1024)}</Ghi>`
    await expect(verify(`<?xml version="1.0"?><HDon>${padding}<script>alert(1)</script></HDon>`)).rejects.toMatchObject(mismatch)
  })
})
