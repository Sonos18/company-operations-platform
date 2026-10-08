type WorkflowMode='legacy'|'document_backed_v1'
export function useCostWorkflowMode(){
 const app=useNuxtApp(),access=app.$companyAccessStore
 const state=useState<{scope:string;mode:WorkflowMode|null;generation:number;status:'idle'|'loading'|'ready'|'error'}>('cost-workflow-mode',()=>({scope:'',mode:null,generation:0,status:'idle'}))
 const scope=()=>JSON.stringify([access.activeCompanyId,[...access.permissions].sort()])
 const mode=computed(()=>state.value.scope===scope()?state.value.mode:null)
 async function refresh(force=false):Promise<WorkflowMode|null>{
  const captured=scope()
  if(!force&&state.value.scope===captured&&state.value.status==='ready')return mode.value
  const generation=state.value.generation+1
  state.value={scope:captured,mode:state.value.scope===captured?state.value.mode:null,generation,status:'loading'}
  if(!access.activeCompanyId||!access.hasAnyPermission(['cost.read','cost.request.read'])||!app.$repositories){
   state.value.status='error';return null
  }
  try{
   const directory=await app.$repositories.costWorkflow.readDirectory({pageSize:1})
   if(scope()!==captured||state.value.generation!==generation)return null
   state.value={scope:captured,mode:directory.mode,generation,status:'ready'}
   return directory.mode
  }catch{
   if(scope()===captured&&state.value.generation===generation)state.value.status='error'
   return null
  }
 }
 function invalidate(){state.value={scope:scope(),mode:null,generation:state.value.generation+1,status:'idle'}}
 return {mode,refresh,invalidate,scope}
}
