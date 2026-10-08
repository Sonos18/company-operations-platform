import {workflowUuidSchema} from '../../shared/schemas/costs/cost-workflow'
export default defineNuxtRouteMiddleware(async to=>{
 if(import.meta.server||!/^\/(?:costs(?:\/|$)|cost-drafts(?:\/|$))/.test(to.path))return
 const app=useNuxtApp()
 if(app.$authStore.lifecycle!=='authenticated')return
 const access=app.$companyAccessStore
 if(!access.hasAnyPermission(['cost.read','cost.request.read']))return
 const captured=JSON.stringify([access.activeCompanyId,[...access.permissions].sort()])
 const workflow=useCostWorkflowMode()
 const mode=await workflow.refresh()
 if(captured!==JSON.stringify([access.activeCompanyId,[...access.permissions].sort()]))return abortNavigation()
 if(mode!=='document_backed_v1')return
 const oldWriter=to.path.startsWith('/cost-drafts')||to.path.startsWith('/costs/sources')||to.path.startsWith('/costs/projects/')||/\/(?:drafts|entries\/new)(?:\/|$)/.test(to.path)
 if(!oldWriter)return
 const candidate=to.path.split('/')[2]
 const project=workflowUuidSchema.safeParse(candidate)
 return navigateTo(project.success?'/costs/'+project.data+'/requests':'/costs')
})
