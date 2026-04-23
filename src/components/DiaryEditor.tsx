import { useEffect } from "react";
import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface DiaryEditorProps {
  value: JSONContent;
  disabled?: boolean;
  onChange: (content: JSONContent, plainText: string) => void;
}

export function DiaryEditor({
  value,
  disabled,
  onChange,
}: DiaryEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: "在纸页上慢慢写下今天发生的事。",
      }),
    ],
    editable: !disabled,
    content: value,
    editorProps: {
      attributes: {
        class: "diary-editor__content",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON(), currentEditor.getText());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentContent = JSON.stringify(editor.getJSON());
    const nextContent = JSON.stringify(value);
    if (currentContent !== nextContent) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return <EditorContent editor={editor} />;
}
