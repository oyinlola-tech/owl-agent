import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/register.all";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { loader } from "@monaco-editor/react";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.editor.defineTheme("owl-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "9b9a97", fontStyle: "italic" },
    { token: "keyword", foreground: "9065b0" },
    { token: "string", foreground: "448361" },
    { token: "number", foreground: "d9730d" },
    { token: "type", foreground: "337ea9" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#37352f",
    "editorLineNumber.foreground": "#c7c6c3",
    "editorLineNumber.activeForeground": "#787774",
    "editor.lineHighlightBackground": "#f7f6f3",
    "editor.selectionBackground": "#2383e233",
    "editorCursor.foreground": "#2383e2",
    "editorIndentGuide.background1": "#ededeb",
  },
});

monaco.editor.defineTheme("owl-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "7f7f7f", fontStyle: "italic" },
    { token: "keyword", foreground: "a988c9" },
    { token: "string", foreground: "5ba57c" },
    { token: "number", foreground: "e2914a" },
    { token: "type", foreground: "519ed2" },
  ],
  colors: {
    "editor.background": "#191919",
    "editor.foreground": "#e6e4de",
    "editorLineNumber.foreground": "#4a4a4a",
    "editorLineNumber.activeForeground": "#9b9b9b",
    "editor.lineHighlightBackground": "#202020",
    "editor.selectionBackground": "#3b93ec44",
    "editorCursor.foreground": "#3b93ec",
    "editorIndentGuide.background1": "#2a2a2a",
  },
});

loader.config({ monaco });
