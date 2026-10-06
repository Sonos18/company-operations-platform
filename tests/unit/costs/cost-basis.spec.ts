import {describe,expect,it} from 'vitest'
import {costRequestInputSchema} from '../../../shared/schemas/costs/cost-workflow'
const id='c1f50000-0000-4000-8000-000000000001'
const input={partyId:id,partyKind:'organization',categoryId:id,amount:'22',currencyCode:'VND',evidenceFileIds:[id],basis:{kind:'materials',deliverySite:'Synthetic site',lines:[{description:'Synthetic pipe',quantity:'2.125',unit:'m',unitPrice:'10.1234'}]}}
describe('reviewed accounting basis',()=>{
 it('retains accountant VAT/rounding notes independently from the amount, without guessed tax formulas',()=>{const accountingBasis={vatBasis:'Included per reviewed quotation',roundingBasis:'Accountant reviewed cents',allowanceBasis:'Not applicable to this material lot'};expect(costRequestInputSchema.parse({...input,accountingBasis}).accountingBasis).toEqual(accountingBasis)})
 it('rejects unknown policy/formula fields and empty notes',()=>{expect(costRequestInputSchema.safeParse({...input,accountingBasis:{vatFormula:'amount*10%'}}).success).toBe(false);expect(costRequestInputSchema.safeParse({...input,accountingBasis:{vatBasis:''}}).success).toBe(false)})
})
