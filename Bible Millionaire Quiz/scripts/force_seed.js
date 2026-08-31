import { initializeDatabases } from '../server/database/core.js';
import dotenv from 'dotenv';
dotenv.config();

async function forceSeed() {
    console.log('🚀 [ForcedSeed] Launching direct SQL strike...');
    try {
        const dbs = await initializeDatabases();
        const db = dbs.notesDb;
        
        console.log('🛠️ STEP 1: Ensuring manual table existence...');
        await db.exec(`
            CREATE TABLE IF NOT EXISTS public.devotional_authors (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                style_id TEXT NOT NULL,
                bio TEXT,
                avatar_url TEXT,
                active BOOLEAN DEFAULT true,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, style_id)
            );
        `);

        console.log('🌱 STEP 2: Executing direct seed for 21 master authors...');
        const authors = [
            { name: '林以恩', style: 'default' }, { name: '陳恩典', style: 'default' }, { name: '何信望', style: 'default' },
            { name: '陳雨晴', style: 'scenicStart' }, { name: '張曉晶', style: 'scenicStart' }, { name: '劉春雨', style: 'scenicStart' },
            { name: '柯靜心', style: 'innerDialogue' }, { name: '黃念慧', style: 'innerDialogue' }, { name: '周思畢', style: 'innerDialogue' },
            { name: '葛書亞', style: 'narrativeFlow' }, { name: '方曉薇', style: 'narrativeFlow' }, { name: '李敘文', style: 'narrativeFlow' },
            { name: '蘇映荷', style: 'poeticImagery' }, { name: '謝詩婷', style: 'poeticImagery' }, { name: '王詠嵐', style: 'poeticImagery' },
            { name: '潘安琪', style: 'gentleCompanion' }, { name: '吳暖心', style: 'gentleCompanion' }, { name: '陳同行', style: 'gentleCompanion' },
            { name: '白默然', style: 'contemplativeStillness' }, { name: '何寂光', style: 'contemplativeStillness' }, { name: '王靜安', style: 'contemplativeStillness' }
        ];

        for (const author of authors) {
            await db.run(
                'INSERT INTO public.devotional_authors (name, style_id) VALUES ($1, $2) ON CONFLICT (name, style_id) DO NOTHING',
                [author.name, author.style]
            );
        }

        console.log('\n--- ✍️ VERIFICATION: BATTLEFIELD STATUS ---');
        const count = await db.get('SELECT COUNT(*) as total FROM public.devotional_authors');
        console.log(`Total Authors Salvaged: ${count?.total || 0}`);
        
        const list = await db.all('SELECT name, style_id FROM public.devotional_authors ORDER BY style_id, name');
        console.table(list);
        console.log('✅ 1.1 SOVEREIGN SALVAGE COMPLETE.');
        
        process.exit(0);
    } catch (e) {
        console.error('❌ Strike Failed:', e.stack);
        process.exit(1);
    }
}

forceSeed();
