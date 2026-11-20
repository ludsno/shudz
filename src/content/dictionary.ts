import { defaultDictionaryService } from "../services/dictionary.service";
import { normalizeChineseSelection } from "../shared/text";
import { shudzState } from "./state";
import { Tooltip } from "./tooltip";
import { TooltipRenderer } from "./tooltip-renderer";

export const Dictionary = {
  normalizeChineseSelection,

  cancelPendingLookup(): void {
    shudzState.activeLookupId++;
  },

  async clearCache(): Promise<void> {
    await defaultDictionaryService.clearCache();
  },

  async fetchDefinition(word: string, range: Range): Promise<void> {
    const requestId = ++shudzState.activeLookupId;

    // Show loading tooltip while fetching
    const loadingNode = TooltipRenderer.createMessageNode(
      "Loading definition..."
    );
    Tooltip.show(word, loadingNode, range);

    const result = await defaultDictionaryService.lookup(word);
    if (requestId !== shudzState.activeLookupId) return;

    const onToggleSave =
      result.status === "success"
        ? () =>
            defaultDictionaryService.toggleSavedWord(
              result.word,
              result.resolvedTerm,
              result.definitions
            )
        : undefined;

    const rendered = TooltipRenderer.renderLookupResult(result, onToggleSave);
    if (requestId !== shudzState.activeLookupId) return;

    Tooltip.show(
      rendered.title,
      rendered.content,
      range,
      rendered.saveOptions
    );
  },
};
