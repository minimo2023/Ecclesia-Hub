import { dbOps } from '../../../../database/index.js';
import { NarrativeComposerService } from './NarrativeComposerService.js';

class NarrativeService {
    /**
     * 獲取故事主資訊
     */
    async getStoryInfo(storyId) {
        return await dbOps.getStory(storyId);
    }

    /**
     * 獲取場景詳細資訊 (由 Composer 負責組裝)
     */
    async getSceneWithDetails(storyId, sceneId, sessionId = null) {
        return await NarrativeComposerService.composeScenePayload(storyId, sceneId, sessionId);
    }

    /**
     * 獲取指定知識頁面
     */
    async getLore(storyId, loreKey) {
        const results = await dbOps.getSceneLore(storyId, [loreKey]);
        return results && results.length > 0 ? results[0] : null;
    }

    /**
     * 獲取所有已發佈的故事列表
     */
    async listPublishedStories() {
        // 暫時保留直接 Query，後續可移入 narrativeOps
        const stories = await dbOps.contentDb.query(
            "SELECT story_id, title, testament, genre, status FROM narrative_stories WHERE status = 'published' ORDER BY created_at DESC"
        );
        return stories;
    }
}

export const narrativeService = new NarrativeService();
