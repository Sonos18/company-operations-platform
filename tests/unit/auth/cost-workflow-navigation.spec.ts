import {expect,it} from 'vitest'
import {canonicalNavigationLinks,filterNavigationLinks,type NavigationPermissionAccess} from '../../../app/components/app/navigation-permissions'
import type {PermissionCode} from '../../../shared/constants/permissions'
const access=(permissions:PermissionCode[]):NavigationPermissionAccess=>({hasPermission:p=>permissions.includes(p),hasAnyPermission:ps=>ps.some(p=>permissions.includes(p))})
it('assigned workflow readers can enter costs without legacy company-wide finance permission',()=>expect(filterNavigationLinks(canonicalNavigationLinks,access(['cost.request.read'])).map(l=>l.to)).toEqual(['/costs']))
it('activation removes legacy source and draft entry points without deleting their records',()=>expect(filterNavigationLinks(canonicalNavigationLinks,access(['cost.read','cost.source.read','cost.prepare']),'document_backed_v1').map(l=>l.to)).toEqual(['/costs']))
it('legacy companies keep their existing source/draft entry points',()=>expect(filterNavigationLinks(canonicalNavigationLinks,access(['cost.read','cost.source.read','cost.prepare']),'legacy').map(l=>l.to)).toEqual(['/costs','/cost-drafts','/costs/sources']))
