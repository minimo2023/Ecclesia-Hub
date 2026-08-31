import{a as b}from"./ApiClient-C7jjIIsp.js";async function f(r,e,l,a,s={},p,i,c){const[o]=l.split(":").map(Number);let t="未知";o>=6&&o<12?t="早上":o>=12&&o<18?t="下午":o>=18&&o<23?t="晚上":t="深夜";let n=`- It is currently ${l} (${t}).
`;a!==null&&(n+=a<5?`- The player called you recently (${Math.floor(a)} mins ago).
`:`- It's been a while since the last call.
`);const m=s.totalCalls||0,u=e?.book&&s.topicCounts?.[e.book]||0;n+=`- You have been called ${m} times in total.
`,n+=`- You have answered about ${e?.book||"this book"} ${u} times.
`;const d={expert:r,question:{question:e?.question||"",options:e?.options||[],answer:e?.answer||"",answerToken:e?.answerToken||null},time_period:t,adjusted_exp:p,max_cap:i,context_prompt:n,playerName:c};try{return console.log(`🤖 Consulting Expert (${r.name}) via BI Backend...`),await b.generateExpertResponse(d)}catch(h){return console.error("Expert Generation Failed:",h),"（通訊中斷...請稍後再試）"}}export{f as generateExpertResponse};
