import cron from 'node-cron';
import { usersDb } from '../database/index.js';
import MailService from '../infrastructure/MailService.js';

/**
 * 每日網站使用率統計服務 (Daily Usage Reporter)
 */
export class UsageReporter {
    constructor() {
        this.adminEmail = 'biblewisdom.suppor@hotmail.com';
    }

    /**
     * 啟動排程 (每日 00:05 執行)
     */
    startSchedule() {
        console.log('📊 [UsageReporter] Registering daily usage report cron job (00:05 AM)...');
        cron.schedule('5 0 * * *', async () => {
            console.log('📊 [UsageReporter] Generating daily usage report...');
            try {
                await this.generateAndSendReport();
            } catch (err) {
                console.error('❌ [UsageReporter] Failed to send report:', err);
            }
        });
    }

    /**
     * 收集數據、產生 HTML 報表並寄出
     */
    async generateAndSendReport() {
        const reportData = await this.collectData();
        const html = this.buildHtmlReport(reportData);
        
        await MailService.send({
            to: this.adminEmail,
            subject: `[聖經智匯] 每日使用率報告 - ${reportData.dateString}`,
            html: html
        });

        console.log(`✅ [UsageReporter] Daily report sent successfully to ${this.adminEmail}`);
    }

    /**
     * 從資料庫收集過去 24 小時的統計數據
     */
    async collectData() {
        const dateString = new Date().toLocaleDateString('zh-TW');

        // 1. DAU (過去 24 小時有活動的用戶)
        // 注意：PostgreSQL 語法
        const dauResult = await usersDb.query(`
            SELECT COUNT(DISTINCT id) as count 
            FROM users 
            WHERE last_active_at >= NOW() - INTERVAL '24 hours' 
               OR last_login >= NOW() - INTERVAL '24 hours'
        `);
        const dauCount = dauResult[0]?.count || 0;

        // 2. 新註冊用戶 (過去 24 小時內建立)
        const newUsersResult = await usersDb.query(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `);
        const newUsersCount = newUsersResult[0]?.count || 0;

        // 3. 遊戲模式統計 (過去 24 小時內的 game_history)
        const modeStatsResult = await usersDb.query(`
            SELECT mode, COUNT(*) as count, SUM(score) as total_score
            FROM game_history 
            WHERE completed_at >= NOW() - INTERVAL '24 hours'
            GROUP BY mode
            ORDER BY count DESC
        `);

        // 4. 總遊戲場次
        const totalGamesPlayed = modeStatsResult.reduce((sum, row) => sum + parseInt(row.count || 0, 10), 0);

        return {
            dateString,
            dauCount,
            newUsersCount,
            totalGamesPlayed,
            modeStats: modeStatsResult
        };
    }

    /**
     * 組裝 HTML 信件內容
     */
    buildHtmlReport(data) {
        let modeListHtml = '';
        if (data.modeStats.length === 0) {
            modeListHtml = '<li>昨日無人進行遊戲</li>';
        } else {
            data.modeStats.forEach(stat => {
                modeListHtml += `<li><strong>${stat.mode}</strong>: ${stat.count} 場</li>`;
            });
        }

        return `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #4A90E2; text-align: center; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">📊 聖經智匯 每日使用率報告</h2>
            <p style="text-align: right; color: #888; font-size: 14px;">日期：${data.dateString} (過去 24 小時統計)</p>
            
            <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin-top: 0; color: #333;">👥 用戶活躍度</h3>
                <ul style="list-style-type: none; padding-left: 0;">
                    <li style="margin-bottom: 8px;">🔸 <strong>每日活躍用戶 (DAU)：</strong> <span style="color: #E25041; font-size: 18px; font-weight: bold;">${data.dauCount}</span> 人</li>
                    <li>🔸 <strong>新增註冊用戶數：</strong> <span style="color: #27AE60; font-size: 18px; font-weight: bold;">${data.newUsersCount}</span> 人</li>
                </ul>
            </div>

            <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px;">
                <h3 style="margin-top: 0; color: #333;">🎮 遊戲場次統計</h3>
                <p style="margin-top: 0; margin-bottom: 10px;">🔸 <strong>總遊戲場次：</strong> <span style="color: #8E44AD; font-size: 18px; font-weight: bold;">${data.totalGamesPlayed}</span> 場</p>
                <p style="margin-bottom: 5px;">🔸 <strong>各模式遊玩次數：</strong></p>
                <ul style="margin-top: 0;">
                    ${modeListHtml}
                </ul>
            </div>

            <p style="margin-top: 30px; font-size: 12px; color: #aaa; text-align: center;">
                這是一封由系統自動發送的信件，請勿直接回覆。<br>
                Bible Millionaire Quiz - 每日報表服務
            </p>
        </div>
        `;
    }
}

// 建立 Singleton 實例
export const usageReporter = new UsageReporter();
