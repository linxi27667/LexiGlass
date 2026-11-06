use serde::{Deserialize, Serialize};

/// 记忆卡片类型：既支持背单词，也支持记代码片段、记知识问答、记通用笔记
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CardKind {
    Vocab,   // 英语单词 / 短语
    Snippet, // 代码片段 / Linux命令 / C语言语法
    Note,    // 知识问答 / 概念卡片 / 其它记忆项
}

/// 艾宾浩斯 (SM-2) 记忆状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MasteryStatus {
    New,      // 未学习
    Learning, // 学习中 / 模糊
    Review,   // 待复习
    Mastered, // 已掌握
}

/// 核心记忆卡片结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryCard {
    pub id: String,
    pub deck_id: String,
    pub group_name: String,       // 例如 "第1组" 或分类子组
    pub kind: CardKind,
    pub front: String,            // 正面：单词 / 问题 / 命令
    pub back: String,             // 背面：中文释义 / 答案详解
    pub pos: Option<String>,      // 词性 (如 adj. / v. / n.) 或副标题
    pub phonetic: Option<String>, // 音标或简短提示
    pub note: Option<String>,     // 补充笔记 / 例句 / 代码块 / 熟词僻义
    pub tags: Vec<String>,
    pub starred: bool,            // ★ 重点标记
    pub status: MasteryStatus,
    pub interval: u32,            // 艾宾浩斯复习间隔（天）
    pub ease_factor: f32,         // 难度系数（默认 2.5）
    pub repetitions: u32,         // 连续记对次数
    pub next_review: Option<String>,
}

/// 卡组（Deck）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deck {
    pub id: String,
    pub name: String,
    pub subtitle: String,
    pub icon: String,
    pub category: String, // "vocab" | "tech" | "custom"
}

/// 大屏角落「随手记」气泡条目 (Quick-Jot Item)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickJotItem {
    pub id: String,
    pub content: String,          // 随手记正文（单词、灵感、命令或待办）
    pub translation: String,      // 释义或补充说明（如果是生词可自动匹配）
    pub pos: String,              // 词性或类型标签（如 "v." / "随手记" / "Linux"）
    pub tag: String,              // "#六级生词" | "#灵感" | "#代码" | "#待办"
    pub created_at: String,       // 记录时间
    pub pinned: bool,             // 是否在角落气泡轮播中置顶
    pub promoted_to_deck: bool,   // 是否已转入正式记忆卡组
}

/// 艾宾浩斯复习评分档位
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ReviewGrade {
    Again = 1, // 忘了（重置间隔）
    Hard = 2,  // 模糊（短间隔复习）
    Good = 3,  // 认识（按标准艾宾浩斯曲线推进）
    Easy = 4,  // 秒答（大幅拉长复习间隔并标记掌握）
}

/// 全局应用持久化状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStateData {
    pub decks: Vec<Deck>,
    pub cards: Vec<MemoryCard>,
    pub quick_jots: Vec<QuickJotItem>,
    pub daily_reviewed_count: u32,
    pub streak_days: u32,
    pub last_study_date: String,
    pub obsidian_vault_path: Option<String>,
}
