import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const sharedSchema = resolve(root, 'shared/schemas/iso-timestamp.ts')

// Only audited DB instant fields are guarded. Business dates and any future
// deliberately stricter contract require their own explicit review.
const boundaries: Record<string, string[]> = {
  'server/features/business-parties/business-party.repository.ts': ['created_at', 'updated_at'],
  'server/features/costs/cost-settings.repository.ts': ['created_at', 'updated_at'],
  'server/features/costs/project-cost.repository.ts': ['created_at', 'updated_at'],
  'server/features/costs/workflow/cost-workflow-cutover.repository.ts': ['reviewed_at'],
  'server/features/engagements/engagement.repository.ts': ['created_at', 'updated_at'],
  'server/features/opportunities/opportunity.repository.ts': ['created_at', 'updated_at', 'ended_at', 'retired_at', 'raised_at', 'resolved_at'],
  'server/features/project-register/project-register.repository.ts': ['created_at', 'updated_at'],
  'server/features/stage01-config/stage01-config.repository.ts': ['created_at', 'updated_at'],
  'server/features/stage01/stage01.repository.ts': ['created_at', 'updated_at', 'final_decision_at', 'evaluated_at', 'submitted_at', 'returned_at'],
  'server/features/workflow/workflow.repository.ts': ['started_at', 'completed_at', 'assigned_at', 'ended_at', 'raised_at', 'resolved_at'],
}

describe('Audited DB timestamp boundaries', () => {
  it.each(Object.entries(boundaries))('uses the shared instant schema in %s', (file, columns) => {
    const filename = resolve(root, file)
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
    const imported = new Set<string>()
    const aliases = new Map<string, ts.Expression>()
    const fields: ts.PropertyAssignment[] = []

    function collect(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && resolve(dirname(filename), node.moduleSpecifier.text + '.ts') === sharedSchema) {
        const bindings = node.importClause?.namedBindings
        if (bindings && ts.isNamedImports(bindings)) {
          for (const item of bindings.elements) {
            if ((item.propertyName ?? item.name).text === 'isoTimestampSchema') imported.add(item.name.text)
          }
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        aliases.set(node.name.text, node.initializer)
      }
      if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
        && columns.includes(node.name.text)) fields.push(node)
      ts.forEachChild(node, collect)
    }
    collect(source)

    function usesSharedSchema(value: ts.Expression, seen = new Set<string>()): boolean {
      if (ts.isIdentifier(value)) {
        if (imported.has(value.text)) return true
        const alias = aliases.get(value.text)
        if (!alias || seen.has(value.text)) return false
        return usesSharedSchema(alias, new Set([...seen, value.text]))
      }
      if (ts.isCallExpression(value) && value.arguments.length === 0
        && ts.isPropertyAccessExpression(value.expression)
        && ['nullable', 'optional'].includes(value.expression.name.text)) {
        return usesSharedSchema(value.expression.expression, seen)
      }
      return false
    }

    expect(imported.size, 'Missing shared timestamp import').toBeGreaterThan(0)
    for (const column of columns) {
      expect(fields.some(field => field.name.getText(source).replace(/['"]/g, '') === column), column).toBe(true)
    }
    for (const field of fields) {
      expect(usesSharedSchema(field.initializer), `${field.name.getText(source)}: ${field.initializer.getText(source)}`).toBe(true)
    }
  })
})
