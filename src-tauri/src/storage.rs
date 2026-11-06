use crate::models::{
    AppStateData, CardKind, Deck, MasteryStatus, MemoryCard, QuickJotItem, ReviewGrade,
};
use crate::obsidian_sync::parse_obsidian_vocab_markdown;
use chrono::{Duration, Local};
use std::fs;
use std::path::{Path, PathBuf};

pub struct StorageEngine {
    pub state_file: PathBuf,
}

impl StorageEngine {
    pub fn new() -> Self {
        let base_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LexiGlass");
        let _ = fs::create_dir_all(&base_dir);
        Self {
            state_file: base_dir.join("lexiglass_state.json"),
        }
    }

    pub fn load_or_init(&self) -> AppStateData {
        if let Ok(raw) = fs::read_to_string(&self.state_file) {
            if let Ok(state) = serde_json::from_str::<AppStateData>(&raw) {
                return state;
            }
        }
        let state = Self::default_initial_state();
        let _ = self.save(&state);
        state
    }

    pub fn save(&self, state: &AppStateData) -> Result<(), String> {
        let json = serde_json::to_string_pretty(state)
            .map_err(|e| format!("序列化状态失败: {}", e))?;
        fs::write(&self.state_file, json).map_err(|e| format!("保存状态文件失败: {}", e))
    }

    /// 执行 SM-2 艾宾浩斯记忆间隔更新
    pub fn apply_sm2_review(card: &mut MemoryCard, grade: ReviewGrade) {
        let quality = grade as u8;
        if quality < 3 {
            card.repetitions = 0;
            card.interval = if quality == 1 { 0 } else { 1 };
            card.status = MasteryStatus::Learning;
        } else {
            card.repetitions += 1;
            card.interval = match card.repetitions {
                1 => 1,
                2 => 3,
                3 => 7,
                _ => ((card.interval as f32) * card.ease_factor).round() as u32,
            };
            card.status = if quality == 4 || card.interval >= 14 {
                MasteryStatus::Mastered
            } else {
                MasteryStatus::Review
            };
        }

        let q = quality as f32;
        card.ease_factor =
            (card.ease_factor + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02))).max(1.3);

        let next_date = Local::now() + Duration::days(card.interval as i64);
        card.next_review = Some(next_date.format("%Y-%m-%d").to_string());
    }

    pub fn default_initial_state() -> AppStateData {
        let vault_path =
            r"C:\Users\juncheng.liu\Desktop\Obsidian_Knowledge_Vault\04-系统知识\英语";
        let decks = vec![
            Deck {
                id: "cet6-core".into(),
                name: "CET-6 六级核心必考 1000 词".into(),
                subtitle: "50组全覆盖 · 含真题搭配与亮点词 ★".into(),
                icon: "🎓".into(),
                category: "vocab".into(),
            },
            Deck {
                id: "cet4-core".into(),
                name: "CET-4 四级高频核心词库".into(),
                subtitle: "27组共 528 词 · 夯实基础词汇".into(),
                icon: "📘".into(),
                category: "vocab".into(),
            },
            Deck {
                id: "tech-notes".into(),
                name: "嵌入式 Linux & C语言 & 架构记忆卡".into(),
                subtitle: "记命令、记指针考点、记排障命令".into(),
                icon: "⚡".into(),
                category: "tech".into(),
            },
            Deck {
                id: "quick-jot-deck".into(),
                name: "随手记 · 灵感与生词收件箱".into(),
                subtitle: "大屏角落气泡窗随手录入的词条与笔记".into(),
                icon: "🫧".into(),
                category: "custom".into(),
            },
        ];

        let mut cards = Vec::new();
        let cet6_md = Path::new(vault_path).join("六级单词.md");
        if cet6_md.exists() {
            if let Ok(mut parsed) = parse_obsidian_vocab_markdown(&cet6_md, "cet6-core", "CET6") {
                cards.append(&mut parsed);
            }
        }
        let cet4_md = Path::new(vault_path).join("四级单词.md");
        if cet4_md.exists() {
            if let Ok(mut parsed) = parse_obsidian_vocab_markdown(&cet4_md, "cet4-core", "CET4") {
                cards.append(&mut parsed);
            }
        }

        // 默认跨领域记忆卡片（「可以记单词，也可以记其他的」）
        cards.push(MemoryCard {
            id: "tech-1".into(),
            deck_id: "tech-notes".into(),
            group_name: "Linux基础".into(),
            kind: CardKind::Snippet,
            front: "Linux 查看端口监听与占用进程命令".into(),
            back: "ss -tulpn | grep <端口号>  或  lsof -i :<端口号>".into(),
            pos: Some("Linux CLI".into()),
            phonetic: Some("运维高频命令".into()),
            note: Some("-t: TCP, -u: UDP, -l: Listening, -p: Process, -n: Numeric port".into()),
            tags: vec!["Linux".into(), "网络排障".into()],
            starred: true,
            status: MasteryStatus::New,
            interval: 0,
            ease_factor: 2.5,
            repetitions: 0,
            next_review: None,
        });

        let quick_jots = vec![
            QuickJotItem {
                id: "jot-1".into(),
                content: "unprecedented".into(),
                translation: "adj. 史无前例的；空前的（六级作文高频首段词）".into(),
                pos: "adj.".into(),
                tag: "#六级生词".into(),
                created_at: Local::now().format("%Y-%m-%d %H:%M").to_string(),
                pinned: true,
                promoted_to_deck: false,
            },
            QuickJotItem {
                id: "jot-2".into(),
                content: "address the climate crisis".into(),
                translation: "熟词僻义：address 作动词表示「着手解决、应对」，而非地址".into(),
                pos: "熟词僻义".into(),
                tag: "#六级熟词僻义".into(),
                created_at: Local::now().format("%Y-%m-%d %H:%M").to_string(),
                pinned: true,
                promoted_to_deck: false,
            },
        ];

        AppStateData {
            decks,
            cards,
            quick_jots,
            daily_reviewed_count: 0,
            streak_days: 1,
            last_study_date: Local::now().format("%Y-%m-%d").to_string(),
            obsidian_vault_path: Some(vault_path.to_string()),
        }
    }
}
