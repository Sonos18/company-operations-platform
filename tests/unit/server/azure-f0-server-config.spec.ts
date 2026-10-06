import {expect,it} from 'vitest'
import {readAzureF0ServerConfiguration,createCostExtractionAdapter} from '../../../server/features/costs/extraction/cost-extraction-config'
const environment={TASKOVIA_COST_OCR_AZURE_ENABLED:'true',TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED:'true',TASKOVIA_COST_OCR_AZURE_ENDPOINT:'https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/',TASKOVIA_COST_OCR_AZURE_API_KEY:'synthetic-secret',TASKOVIA_COST_OCR_AZURE_SKU:'F0'}
it('defaults disabled and requires BOTH explicit gates and all approved resource metadata',()=>{expect(readAzureF0ServerConfiguration({}).enabled).toBe(false);for(const name of ['TASKOVIA_COST_OCR_AZURE_ENABLED','TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED','TASKOVIA_COST_OCR_AZURE_ENDPOINT','TASKOVIA_COST_OCR_AZURE_API_KEY']){const missing:Record<string,string|undefined>={...environment};missing[name]=undefined;expect(readAzureF0ServerConfiguration(missing).enabled,name).toBe(false)}})
it('keeps credentials in a lazy server-only closure, outside serialized configuration',()=>{const parsed=readAzureF0ServerConfiguration(environment);expect(parsed.enabled).toBe(true);expect(JSON.stringify(parsed)).not.toContain('synthetic-secret');if(parsed.enabled){expect(parsed.credential()).toBe('synthetic-secret');expect(parsed.config.endpoint).toBe('https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com')}})
it('refuses S0, a foreign endpoint or an increased free quota budget',()=>{for(const changed of [{TASKOVIA_COST_OCR_AZURE_SKU:'S0'},{TASKOVIA_COST_OCR_AZURE_ENDPOINT:'https://attacker.invalid/'},{TASKOVIA_COST_OCR_AZURE_MONTHLY_PAGE_BUDGET:'501'}])expect(readAzureF0ServerConfiguration({...environment,...changed}).enabled).toBe(false)})
it('configuration alone cannot activate external OCR without approved persistent job/scope/inspection ports',async()=>{const result=await createCostExtractionAdapter({environment}).extract({fileId:'11111111-1111-4111-8111-111111111111',mimeType:'application/pdf',bytes:new Uint8Array([1]),scope:{companyId:'22222222-2222-4222-8222-222222222222',projectId:'33333333-3333-4333-8333-333333333333'}});expect(result.status).toBe('unavailable');expect(result.warnings).toContain('OCR_PROVIDER_NOT_CONFIGURED')})

it('accepts only canonical integer budgets from one through five hundred',()=>{
 for(const budget of ['1','20','500'])expect(readAzureF0ServerConfiguration({...environment,TASKOVIA_COST_OCR_AZURE_MONTHLY_PAGE_BUDGET:budget}).enabled).toBe(true);
 for(const budget of ['0','501','01','1.5',' 20','20 ','1e2','-1','500d'])expect(readAzureF0ServerConfiguration({...environment,TASKOVIA_COST_OCR_AZURE_MONTHLY_PAGE_BUDGET:budget}).enabled,budget).toBe(false);
});
it('pins configuration to the user approved endpoint and rejects URL decorations',()=>{
 for(const endpoint of ['https://other.cognitiveservices.azure.com','http://taskovia-doc-intelligence-dev.cognitiveservices.azure.com','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com:444','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/path','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com?foo=bar','https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com#fragment','https://user@taskovia-doc-intelligence-dev.cognitiveservices.azure.com'])
 expect(readAzureF0ServerConfiguration({...environment,TASKOVIA_COST_OCR_AZURE_ENDPOINT:endpoint}).enabled,endpoint).toBe(false);
});
it('does not consult any environment value on the unwired factory path',()=>{
 const unread=new Proxy({}, {get(){throw new Error('environment must remain unread');}});
 expect(()=>createCostExtractionAdapter({environment:unread})).not.toThrow();
});
it('requires lowercase exact true for both transmission gates',()=>{
 for(const value of ['TRUE','1','yes','true ','false']){
 expect(readAzureF0ServerConfiguration({...environment,TASKOVIA_COST_OCR_AZURE_ENABLED:value}).enabled).toBe(false);
 expect(readAzureF0ServerConfiguration({...environment,TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED:value}).enabled).toBe(false);
 }
});
