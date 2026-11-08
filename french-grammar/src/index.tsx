import { Action, ActionPanel, Detail, List, Icon, Keyboard } from "@raycast/api";
import { useState, useMemo } from "react";
import data from "./data.json";

interface GrammarItem {
  id: string;
  title: string;
  category: string;
  markdown: string;
}

const items: GrammarItem[] = data as GrammarItem[];
const categories = Array.from(new Set(items.map((i) => i.category)));

// Shortcuts for the 10 categories: Cmd+0 ~ Cmd+9
const categoryShortcuts = [
  Keyboard.Shortcut.Common.Copy, // placeholder, we'll define custom
];

function GrammarDetail({ item }: { item: GrammarItem }) {
  return (
    <Detail
      navigationTitle={item.title}
      markdown={item.markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Content" content={item.markdown} />
          <Action.CopyToClipboard title="Copy Title" content={item.title} />
          <ActionPanel.Section title="Jump to Category">
            {categories.map((cat, idx) => (
              <Action.Push
                key={cat}
                title={cat}
                target={<CategoryList category={cat} />}
                shortcut={{ modifiers: ["cmd"], key: String(idx) as Keyboard.Key }}
              />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function CategoryList({ category }: { category: string }) {
  const catItems = items.filter((i) => i.category === category);
  return (
    <List navigationTitle={category} searchBarPlaceholder={`Search in ${category}...`}>
      {catItems.map((item) => (
        <List.Item
          key={item.id}
          title={item.title}
          icon={Icon.Book}
          actions={
            <ActionPanel>
              <Action.Push title="View" target={<GrammarDetail item={item} />} />
              <Action.CopyToClipboard title="Copy Title" content={item.title} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default function Command() {
  const [searchText, setSearchText] = useState("");

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return [];
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.markdown.toLowerCase().includes(q)
    );
  }, [searchText]);

  const isSearching = searchText.trim().length > 0;

  return (
    <List
      searchBarPlaceholder="Search all grammar entries..."
      onSearchTextChange={setSearchText}
      throttle
    >
      {isSearching ? (
        filtered.map((item) => (
          <List.Item
            key={item.id}
            title={item.title}
            subtitle={item.category}
            icon={Icon.Book}
            actions={
              <ActionPanel>
                <Action.Push title="View" target={<GrammarDetail item={item} />} />
                <Action.CopyToClipboard title="Copy Title" content={item.title} />
              </ActionPanel>
            }
          />
        ))
      ) : (
        categories.map((category) => {
          const count = items.filter((i) => i.category === category).length;
          return (
            <List.Item
              key={category}
              title={category}
              subtitle={`${count} items`}
              icon={Icon.Folder}
              actions={
                <ActionPanel>
                  <Action.Push title="Open" target={<CategoryList category={category} />} />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
