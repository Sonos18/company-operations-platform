import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const componentSource = (name: string) => readFile(
  new URL(`../../../app/components/stage01-config/${name}`, import.meta.url),
  'utf8',
)

const pageSource = () => readFile(
  new URL('../../../app/pages/settings/stage-01.vue', import.meta.url),
  'utf8',
)

describe('Stage 01 configuration component source contracts', () => {
  // Defect caught: a new local row could take a published identity, become disabled,
  // and never reach a valid emitted state. Task 7 covers the rendered interaction.
  it('rejects published taxonomy codes and criterion keys before assigning local editor values', async () => {
    const [taxonomyEditor, criteriaEditor] = await Promise.all([
      componentSource('Stage01TaxonomyEditor.vue'),
      componentSource('Stage01CriteriaEditor.vue'),
    ])

    expect(taxonomyEditor).toContain(`const nextCode = typeof value === 'string' ? value : ''`)
    expect(taxonomyEditor).toContain('if (isPublishedCode(taxonomyKey, nextCode)) return')
    expect(taxonomyEditor.indexOf('if (isPublishedCode(taxonomyKey, nextCode)) return'))
      .toBeLessThan(taxonomyEditor.indexOf('entry.code = nextCode'))

    expect(criteriaEditor).toContain(`const nextValue = typeof value === 'string' ? value : ''`)
    expect(criteriaEditor).toContain("if (field === 'key' && publishedKeys.value.has(nextValue)) return")
    expect(criteriaEditor.indexOf("if (field === 'key' && publishedKeys.value.has(nextValue)) return"))
      .toBeLessThan(criteriaEditor.indexOf('criterion[field] = nextValue'))
  })

  // Defect caught: the criteria editor could add new criteria but offered no supported
  // remove/add attempt, even though backend guards own the final historical decision.
  it('offers a labeled criteria remove action without excluding published keys', async () => {
    const criteriaEditor = await componentSource('Stage01CriteriaEditor.vue')

    expect(criteriaEditor).toContain('function removeCriterion(index: number): void')
    expect(criteriaEditor).toContain('if (editorValue.value.length <= 5) return')
    expect(criteriaEditor).toContain('editorValue.value.splice(index, 1)')
    expect(criteriaEditor).toContain('aria-label="`Xóa tiêu chí: ${criterion.label || criterion.key || \'mới\'}`"')
    expect(criteriaEditor).toContain('@click="removeCriterion(index)"')

    const removeHandler = criteriaEditor.slice(
      criteriaEditor.indexOf('function removeCriterion'),
      criteriaEditor.indexOf('function addCriterion'),
    )
    expect(removeHandler).not.toContain('publishedKeys')
  })

  // Defect caught: intentionally invalid in-progress field values stay in leaf editor
  // state, so the page must still protect them as unsaved changes without persisting them.
  it('wires local invalid editor state into page-level dirty protection', async () => {
    const [taxonomyEditor, criteriaEditor, page] = await Promise.all([
      componentSource('Stage01TaxonomyEditor.vue'),
      componentSource('Stage01CriteriaEditor.vue'),
      pageSource(),
    ])

    for (const editor of [taxonomyEditor, criteriaEditor]) {
      expect(editor).toContain("'update:localDirty': [value: boolean]")
      expect(editor).toContain("emit('update:localDirty', true)")
      expect(editor).toContain("emit('update:localDirty', false)")
    }

    expect(page).toContain('const pageDirty = computed(() => dirty.value || taxonomyEditorDirty.value || criteriaEditorDirty.value)')
    expect(page).toContain('@update:local-dirty="taxonomyEditorDirty = $event"')
    expect(page).toContain('@update:local-dirty="criteriaEditorDirty = $event"')
    expect(page).toContain(':dirty="pageDirty"')
    expect(page).toContain('if (hasLocalEditorChanges.value)')
  })

  // Defect caught: a failed destructive mutation left its dialog over the accessible
  // page alert, obscuring the server error and its recovery action.
  it('closes destructive confirmations after request failure so the page alert is visible', async () => {
    const page = await pageSource()

    const discardHandler = page.slice(
      page.indexOf("if (confirmation.value === 'discard')"),
      page.indexOf("if (confirmation.value === 'publish')"),
    )
    const publishHandler = page.slice(
      page.indexOf("if (confirmation.value === 'publish')"),
      page.indexOf('async function reloadConfiguration'),
    )

    expect(discardHandler).toContain('confirmation.value = null')
    expect(discardHandler).toMatch(/if \(!actionError\.value\) clearLocalEditorChanges\(\)\s*confirmation\.value = null/)
    expect(publishHandler).toContain('confirmation.value = null')
    expect(publishHandler).toMatch(/catch \(caught\) \{\s*actionError\.value = caught\s*confirmation\.value = null/)
  })
})
