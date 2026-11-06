use crate::models::{CardKind, MasteryStatus, MemoryCard, QuickJotItem};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

/// 从本机 Obsidian 知识库的 `六级单词.md` 或 `四级单词.md` 解析 Markdown 表格词汇
pub fn parse_obsidian_vocab_markdown(
    file_path: &Path,
    deck_id: &str,
    default_tag: &str,
) -> Result<Vec<MemoryCard>, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("读取 Markdown 词库失败 ({}): {}", file_path.display(), e))?;

    let mut cards = Vec::new();
    let mut current_group = String::from("第1组");
    let mut in_vocab_groups = false;
    let mut index = 0usize;

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.starts_with("## 第") && line.contains("组") {
            current_group = line.trim_start_matches('#').trim().to_string();
            in_vocab_groups = true;
            continue;
        }
        if line.starts_with("# 一、") || line.starts_with("### 📋") {
            in_vocab_groups = false;
            break;
        }
        if !in_vocab_groups || !line.starts_with('|') {
            continue;
        }

        let cols: Vec<&str> = line
            .trim_matches('|')
            .split('|')
            .map(|c| c.trim())
            .collect();
        if cols.len() < 3 {
            continue;
        }
        let raw_word = cols[0];
        let meaning = cols[1];
        let pos = cols[2];

        if raw_word == "单词/短语" || raw_word.starts_with(':') || raw_word.starts_with('-') {
            continue;
        }

        let starred = raw_word.contains('★');
        let clean_word = raw_word.replace('★', "").trim().to_string();
        if clean_word.is_empty() {
            continue;
        }

        index += 1;
        cards.push(MemoryCard {
            id: format!("{}-{}", deck_id, index),
            deck_id: deck_id.to_string(),
            group_name: current_group.clone(),
            kind: CardKind::Vocab,
            front: clean_word,
            back: meaning.to_string(),
            pos: Some(pos.to_string()),
            phonetic: None,
            note: None,
            tags: vec![default_tag.to_string(), current_group.clone()],
            starred,
            status: MasteryStatus::New,
            interval: 0,
            ease_factor: 2.5,
            repetitions: 0,
            next_review: None,
        });
    }

    Ok(cards)
}

/// 将大屏角落「随手记」条目同步追加到 Obsidian Markdown 随手记/词库文档
pub fn append_quick_jot_to_markdown(file_path: &Path, item: &QuickJotItem) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_path)
        .map_err(|e| format!("打开 Markdown 文件失败: {}", e))?;

    let row = format!(
        "\n| {} | {} | {} | {} | {} |",
        item.content, item.translation, item.pos, item.tag, item.created_at
    );
    file.write_all(row.as_bytes())
        .map_err(|e| format!("写入随手记到 Markdown 失败: {}", e))
}
