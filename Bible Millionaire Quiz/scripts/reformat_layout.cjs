const fs = require('fs');

const path = 'src/features/GameOnline/HostScreen.jsx';
let code = fs.readFileSync(path, 'utf-8');

const targetStr = '<div className="space-y-8">';
const replaceStartIdx = code.indexOf(targetStr);

const errorStr = '{error && (';
const replaceEndIdx = code.indexOf(errorStr);

if (replaceStartIdx === -1 || replaceEndIdx === -1) {
    console.error('Could not find target strings');
    process.exit(1);
}

const beforeBlock = code.substring(0, replaceStartIdx);
const middleBlock = code.substring(replaceStartIdx, replaceEndIdx);
const afterBlock = code.substring(replaceEndIdx);

// We need to parse middleBlock into parts
const modeSelectorIdx = middleBlock.indexOf('{/* Mode Selector */}');
const prizePoolIdx = middleBlock.indexOf('{/* Row: Prize Pool Settings */}');
const row1Idx = middleBlock.indexOf('{/* Row 1: Host Name & Question Count */}');
const row3TeamIdx = middleBlock.indexOf('{/* Row 3: Team Mode Settings (only show in team mode) */}');
const row3DiffIdx = middleBlock.indexOf('{/* Row 3: Difficulty & Control */}');

const modeSelector = middleBlock.substring(modeSelectorIdx, prizePoolIdx);
const prizePool = middleBlock.substring(prizePoolIdx, row1Idx);
const row1 = middleBlock.substring(row1Idx, row3TeamIdx);
const row3Team = middleBlock.substring(row3TeamIdx, row3DiffIdx);
const row3Diff = middleBlock.substring(row3DiffIdx);

const newMiddle = `<div className="flex flex-col gap-8">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {/* 左側欄位：遊戲模式、隊伍設定、獎金池 */}
                            <div className="flex flex-col gap-8">
                                ${modeSelector}
                                ${row3Team}
                                ${prizePool}
                            </div>

                            {/* 右側欄位：房主名稱、題數、難度、控制 */}
                            <div className="flex flex-col gap-8">
                                ${row1}
                                ${row3Diff}
                            </div>
                        </div>

                        `;

fs.writeFileSync(path, beforeBlock + newMiddle + afterBlock, 'utf-8');
console.log('Layout updated successfully');
