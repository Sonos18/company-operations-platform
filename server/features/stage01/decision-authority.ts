export interface DecisionAuthorityResolver {
  resolve(input: {
    companyId: string
    opportunityId: string
    workflowInstanceId: string
    decisionCycleId: string
  }): Promise<{ userId: string, ruleReference: string } | null>
}
