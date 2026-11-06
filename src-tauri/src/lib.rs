pub mod models;
pub mod obsidian_sync;
pub mod storage;

use chrono::Local;
use models::{AppStateData, CardKind, MasteryStatus, MemoryCard, QuickJotItem, ReviewGrade};
use obsidian_sync::parse_obsidian_vocab_markdown;
use std::path::Path;
use std::sync::Mutex;
use storage::StorageEngine;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

pub struct AppState {
    pub engine: StorageEngine,
    pub data: Mutex<AppStateData>,
}

#[tauri::command]
fn get_app_state(state: State<'_, AppState>) -> AppStateData {
    state.data.lock().unwrap().clone()
}

#[tauri::command]
fn review_card(
    state: State<'_, AppState>,
    card_id: String,
    grade: u8,
) -> Result<AppStateData, String> {
    let mut data = state.data.lock().unwrap();
    let review_grade = match grade {
        1 => ReviewGrade::Again,
        2 => ReviewGrade::Hard,
        3 => ReviewGrade::Good,
        _ => ReviewGrade::Easy,
    };

    if let Some(card) = data.cards.iter_mut().find(|c| c.id == card_id) {
        StorageEngine::apply_sm2_review(card, review_grade);
        data.daily_reviewed_count += 1;
    }
    state.engine.save(&data)?;
    Ok(data.clone())
}

#[tauri::command]
fn toggle_star_card(
    state: State<'_, AppState>,
    card_id: String,
) -> Result<AppStateData, String> {
    let mut data = state.data.lock().unwrap();
    if let Some(card) = data.cards.iter_mut().find(|c| c.id == card_id) {
        card.starred = !card.starred;
    }
    state.engine.save(&data)?;
    Ok(data.clone())
}

/// 在大屏角落「随手记」气泡窗中极速添加一条单词或任意笔记
#[tauri::command]
fn add_quick_jot(
    state: State<'_, AppState>,
    content: String,
    translation: String,
    pos: String,
    tag: String,
    also_add_to_deck: bool,
) -> Result<AppStateData, String> {
    let mut data = state.data.lock().unwrap();
    let trimmed = content.trim().to_string();
    if trimmed.is_empty() {
        return Err("随手记内容不能为空".into());
    }

    // 如果未填写释义，自动从内置四六级词库检索匹配释义
    let mut final_trans = translation.trim().to_string();
    let mut final_pos = pos.trim().to_string();
    if final_trans.is_empty() {
        if let Some(found) = data
            .cards
            .iter()
            .find(|c| c.front.eq_ignore_ascii_case(&trimmed))
        {
            final_trans = found.back.clone();
            if final_pos.is_empty() {
                final_pos = found.pos.clone().unwrap_or_else(|| "vocab".into());
            }
        }
    }

    let id = format!("jot-{}", Uuid::new_v4());
    let item = QuickJotItem {
        id: id.clone(),
        content: trimmed.clone(),
        translation: if final_trans.is_empty() {
            "随手记便签".into()
        } else {
            final_trans.clone()
        },
        pos: if final_pos.is_empty() {
            "随手记".into()
        } else {
            final_pos.clone()
        },
        tag: if tag.trim().is_empty() {
            "#随手记".into()
        } else {
            tag
        },
        created_at: Local::now().format("%Y-%m-%d %H:%M").to_string(),
        pinned: true,
        promoted_to_deck: also_add_to_deck,
    };

    data.quick_jots.insert(0, item);

    if also_add_to_deck {
        data.cards.insert(
            0,
            MemoryCard {
                id: format!("custom-{}", Uuid::new_v4()),
                deck_id: "quick-jot-deck".into(),
                group_name: "随手记精选".into(),
                kind: CardKind::Note,
                front: trimmed,
                back: final_trans,
                pos: Some(final_pos),
                phonetic: None,
                note: Some("来自大屏角落「随手记」气泡窗".into()),
                tags: vec!["随手记".into()],
                starred: true,
                status: MasteryStatus::New,
                interval: 0,
                ease_factor: 2.5,
                repetitions: 0,
                next_review: None,
            },
        );
    }

    state.engine.save(&data)?;
    Ok(data.clone())
}

#[tauri::command]
fn delete_quick_jot(
    state: State<'_, AppState>,
    jot_id: String,
) -> Result<AppStateData, String> {
    let mut data = state.data.lock().unwrap();
    data.quick_jots.retain(|j| j.id != jot_id);
    state.engine.save(&data)?;
    Ok(data.clone())
}

/// 一键同步本机 Obsidian 知识库中的《六级单词.md》与《四级单词.md》
#[tauri::command]
fn sync_obsidian_vault(
    state: State<'_, AppState>,
    vault_dir: Option<String>,
) -> Result<AppStateData, String> {
    let mut data = state.data.lock().unwrap();
    let dir_str = vault_dir
        .or_else(|| data.obsidian_vault_path.clone())
        .unwrap_or_else(|| {
            r"C:\Users\juncheng.liu\Desktop\Obsidian_Knowledge_Vault\04-系统知识\英语".into()
        });

    let cet6_path = Path::new(&dir_str).join("六级单词.md");
    if cet6_path.exists() {
        let fresh_cet6 = parse_obsidian_vocab_markdown(&cet6_path, "cet6-core", "CET6")?;
        data.cards.retain(|c| c.deck_id != "cet6-core");
        data.cards.extend(fresh_cet6);
    }

    state.engine.save(&data)?;
    Ok(data.clone())
}

/// 切换大屏角落「随手记」悬浮气泡窗显示/隐藏与置顶
#[tauri::command]
fn toggle_bubble_window(app: AppHandle) -> Result<bool, String> {
    if let Some(win) = app.get_webview_window("bubble") {
        let is_visible = win.is_visible().unwrap_or(false);
        if is_visible {
            let _ = win.hide();
            Ok(false)
        } else {
            let _ = win.show();
            let _ = win.set_always_on_top(true);
            let _ = win.set_focus();
            Ok(true)
        }
    } else {
        Err("未找到随手记气泡窗口实例".into())
    }
}

pub fn run() {
    let engine = StorageEngine::new();
    let initial_data = engine.load_or_init();

    tauri::Builder::default()
        .manage(AppState {
            engine,
            data: Mutex::new(initial_data),
        })
        .setup(|app| {
            // 为主窗口与角落随手记气泡窗启用 Windows 10/11 原生 Acrylic 亚克力毛玻璃效果
            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_acrylic;
                if let Some(main_win) = app.get_webview_window("main") {
                    let _ = apply_acrylic(&main_win, Some((13, 17, 26, 200)));
                }
                if let Some(bubble_win) = app.get_webview_window("bubble") {
                    let _ = apply_acrylic(&bubble_win, Some((15, 20, 32, 185)));
                    let _ = bubble_win.set_always_on_top(true);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            review_card,
            toggle_star_card,
            add_quick_jot,
            delete_quick_jot,
            sync_obsidian_vault,
            toggle_bubble_window
        ])
        .run(tauri::generate_context!())
        .expect("启动 LexiGlass 失败");
}
