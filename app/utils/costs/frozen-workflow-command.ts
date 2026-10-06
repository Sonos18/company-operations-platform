export function createFrozenWorkflowCommand<TInput,TResult>(options:{send(destination:string,input:TInput,key:string):Promise<TResult>;isScopeCurrent():boolean}){
 let pending:{destination:string;serialized:string;input:TInput;key:string}|null=null
 let inFlight:Promise<TResult>|null=null
 return {async attempt(destination:string,input:TInput):Promise<TResult>{
  if(!options.isScopeCurrent())throw new Error('WORKFLOW_SCOPE_CHANGED')
  const serialized=JSON.stringify(input)
  if(pending&&(pending.destination!==destination||pending.serialized!==serialized))throw new Error('WORKFLOW_COMMAND_UNCERTAIN')
  pending??={destination,serialized,input:structuredClone(input),key:crypto.randomUUID()}
  if(inFlight)return inFlight
  const command=pending
  const promise=(async()=>{
   const result=await options.send(command.destination,structuredClone(command.input),command.key)
   if(!options.isScopeCurrent())throw new Error('WORKFLOW_SCOPE_CHANGED')
   pending=null
   return result
  })()
  inFlight=promise
  try{return await promise}finally{if(inFlight===promise)inFlight=null}
 }}
}
