import { describe, expect, it } from 'vitest'
import { resolveAccessNavigation } from '../../../app/services/auth/access-policy'

describe('access navigation policy', () => {
  it('redirects anonymous visitors to login with only a safe internal return path', () => {
    expect(resolveAccessNavigation({
      path: '/projects',
      lifecycle: 'anonymous',
    })).toEqual({ type: 'redirect', to: '/login?redirect=%2Fprojects' })
  })

  it('keeps the recovery flow locked to recovery routes', () => {
    expect(resolveAccessNavigation({
      path: '/projects',
      lifecycle: 'recovery',
    })).toEqual({ type: 'redirect', to: '/reset-password' })
    expect(resolveAccessNavigation({
      path: '/reset-password',
      authMode: 'recovery',
      requiresCompany: false,
      lifecycle: 'recovery',
    })).toEqual({ type: 'allow' })

    expect(resolveAccessNavigation({
      path: '/reset-password',
      authMode: 'recovery',
      requiresCompany: false,
      lifecycle: 'anonymous',
    })).toEqual({ type: 'redirect', to: '/login' })
  })

  it('routes authenticated users without a company to no-access', () => {
    expect(resolveAccessNavigation({
      path: '/projects',
      lifecycle: 'authenticated',
      companyIds: [],
    })).toEqual({ type: 'redirect', to: '/no-access' })
  })

  it('sends authenticated users with multiple unselected companies to company selection', () => {
    expect(resolveAccessNavigation({
      path: '/projects',
      lifecycle: 'authenticated',
      companyIds: ['company-a', 'company-b'],
    })).toEqual({ type: 'redirect', to: '/select-company' })

    expect(resolveAccessNavigation({
      path: '/select-company',
      authMode: 'authenticated',
      requiresCompany: false,
      lifecycle: 'authenticated',
      companyIds: ['company-a', 'company-b'],
    })).toEqual({ type: 'allow' })
  })

  it('redirects missing exact or any required permissions without signing out', () => {
    expect(resolveAccessNavigation({
      path: '/projects',
      lifecycle: 'authenticated',
      companyIds: ['company-a'],
      requiredPermission: 'project.read',
      permissions: ['task.read_assigned'],
    })).toEqual({ type: 'redirect', to: '/forbidden' })

    expect(resolveAccessNavigation({
      path: '/employees',
      lifecycle: 'authenticated',
      companyIds: ['company-a'],
      requiredAnyPermissions: ['employee.read_directory', 'employee.read_all'],
      permissions: ['task.read_assigned'],
    })).toEqual({ type: 'redirect', to: '/forbidden' })
  })

  it('uses access state rather than a redirect query for protected access-state routes', () => {
    expect(resolveAccessNavigation({
      path: '/login',
      authMode: 'guest',
      requiresCompany: false,
      lifecycle: 'authenticated',
      companyIds: ['company-a'],
      activeCompanyId: 'company-a',
      redirect: '/no-access',
    })).toEqual({ type: 'redirect', to: '/projects' })
  })
})
