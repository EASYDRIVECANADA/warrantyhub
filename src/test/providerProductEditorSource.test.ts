import { describe, expect, it } from "vitest";

import editorSource from "../pages/provider/ProviderProductEditorPage.tsx?raw";
import productsSource from "../pages/provider/ProviderProductsPage2.tsx?raw";

describe("ProviderProductEditorPage source", () => {
  it("shows the product type label instead of the raw VSC code in the select trigger", () => {
    expect(editorSource).toContain("<SelectValue labels={TYPE_LABELS}");
  });

  it("does not expose AI product import UI", () => {
    expect(editorSource).not.toContain("AI-Powered Plan Import");
    expect(editorSource).not.toContain('value: "ai"');
    expect(editorSource).not.toContain("handleAIExtract");
    expect(productsSource).not.toContain("AI Import");
    expect(productsSource).not.toContain("/provider/products/new?ai=true");
  });
});
