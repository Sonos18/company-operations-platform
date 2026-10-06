import {summarizeWorkflowCash} from '../workflow/cost-workflow-money'
import {workflowFinanceSchema,type WorkflowCashSnapshot} from '../../../../shared/schemas/costs/cost-workflow-reporting'
export function projectWorkflowCash(input:WorkflowCashSnapshot){
 const seen=new Map<string,string>()
 for(const category of input.categories)for(const payment of category.outgoing){
  const previous=seen.get(payment.id)
  if(previous!==undefined&&previous!==category.code)throw new Error('CONFLICTING_CASH_CATEGORY')
  seen.set(payment.id,category.code)
 }
 function summary(categories:WorkflowCashSnapshot['categories']){
  const unreconciledCount=categories.reduce((n,c)=>n+c.unreconciledCount,0)
  const recorded=categories.some(c=>c.outgoing.length>0||c.installments.length>0||c.verifiedLegacyCount>0)
  return summarizeWorkflowCash({currencyCode:input.project.currencyCode,moneyScale:input.project.moneyScale,outgoing:categories.flatMap(c=>c.outgoing),refunds:categories.flatMap(c=>c.refunds),installments:categories.flatMap(c=>c.installments),unreconciledCount,coverage:unreconciledCount>0?'partial':recorded?'complete':'not_recorded'})
 }
 return workflowFinanceSchema.parse({schemaVersion:2,project:input.project,workflowCash:summary(input.categories),categories:input.categories.map(c=>({categoryId:c.categoryId,code:c.code,name:c.name,displayOrder:c.displayOrder,workflowCash:summary([c]),retention:c.retention}))})
}
