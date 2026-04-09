import type { Locator, Page } from '@playwright/test';

export async function setEditorContent(
  page: Page,
  editor: Locator,
  text: string,
): Promise<void> {
  const containerHandle = await editor.evaluateHandle((el) => el.closest('[id$="-editor"]'));
  await page.evaluate(
    ([container, value]) => {
      const w = window as unknown as { monaco: typeof import('monaco-editor') };
      for (const ed of w.monaco.editor.getEditors()) {
        if (ed.getDomNode()?.parentElement === container) {
          ed.setValue(value);
          return;
        }
      }
      throw new Error('Monaco editor not found for container');
    },
    [containerHandle, text] as const,
  );
}
