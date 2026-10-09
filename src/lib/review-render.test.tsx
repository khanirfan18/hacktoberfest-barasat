import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewText } from "../components/gym/ReviewText";

describe("review text rendering", () => {
  it("renders markup-looking review text inertly", () => {
    const html = renderToStaticMarkup(<ReviewText>{"<script>alert('x')</script>"}</ReviewText>);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
