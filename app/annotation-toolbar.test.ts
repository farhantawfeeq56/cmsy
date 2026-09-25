import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnnotationToolbar, showsAnnotationToolbar } from "./annotation-toolbar";

describe("showsAnnotationToolbar", () => {
  it("shows on local dev", () => {
    expect(showsAnnotationToolbar("localhost")).toBe(true);
    expect(showsAnnotationToolbar("127.0.0.1")).toBe(true);
    expect(showsAnnotationToolbar("[::1]")).toBe(true);
    expect(showsAnnotationToolbar("macbook.local")).toBe(true);
  });

  it("shows on Cloudflare branch previews", () => {
    expect(showsAnnotationToolbar("fix-92-agentation-preview-visibility-cmsy.webdesignbyft.workers.dev")).toBe(true);
  });

  it("stays hidden in production", () => {
    expect(showsAnnotationToolbar("cmsy.webdesignbyft.workers.dev")).toBe(false);
    expect(showsAnnotationToolbar("cmsy.example.com")).toBe(false);
    expect(showsAnnotationToolbar("webdesignbyft.workers.dev")).toBe(false);
  });

  it("does not read a lookalike host as local", () => {
    expect(showsAnnotationToolbar("localhost.example.com")).toBe(false);
    expect(showsAnnotationToolbar("notcmsy.webdesignbyft.workers.dev")).toBe(false);
  });
});

describe("AnnotationToolbar", () => {
  it("renders nothing on the server, so production HTML never carries it", () => {
    expect(renderToString(createElement(AnnotationToolbar))).toBe("");
  });
});
