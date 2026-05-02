const headers={
  "content-type":"application/json;charset=utf-8",
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "access-control-allow-headers":"content-type"
};
const json=(obj,status=200)=>new Response(JSON.stringify(obj,null,2),{status,headers});

function sampleRaces(){
  const base=[
    {id:"202605020501",race:{date:"2026/05/02",place:"東京",raceNo:"11",raceName:"青葉賞",grade:"G2",condition:"3歳",surface:"芝",distance:"2400m",headcount:"18"}},
    {id:"202605020801",race:{date:"2026/05/02",place:"京都",raceNo:"11",raceName:"ユニコーンS",grade:"G3",condition:"3歳",surface:"ダート",distance:"1900m",headcount:"16"}},
    {id:"202605030803",race:{date:"2026/05/03",place:"京都",raceNo:"11",raceName:"天皇賞（春）",grade:"G1",condition:"4歳以上",surface:"芝",distance:"3200m",headcount:"16"}}
  ];
  return base.map((r,idx)=>({...r,horses:Array.from({length:Number(r.race.headcount||16)},(_,i)=>{
    const no=i+1;return {frame:String(Math.ceil(no/2)),no:String(no),name:`サンプルホース${idx+1}-${no}`,last1:String((no*2)%9+1),last2:String((no*3)%9+1),last3:String((no*5)%9+1),odds:(2.0+no*1.7).toFixed(1)};
  })}));
}
function sampleResults(){return [
  {id:"202605020501",result:{firstNo:"5",secondNo:"14",thirdNo:"6",umarenPay:"4280",sanrenpukuPay:"18500"}}
];}
function localAdvice(body){
  const auto=body.autoPrediction||{};const my=body.myPrediction||{};
  const useMy=my.axis&&((my.umaren||[]).length||(my.sanrenpuku||[]).length);
  const confidence=auto.type==="S型"?"高":auto.type==="A型"?"中":"低";
  return {
    source:"ai",
    decision:auto.decision==="bet"?"bet":"skip",
    confidence,
    axis:useMy?my.axis:auto.axis,
    umaren:useMy&&my.umaren?.length?my.umaren:auto.umaren||[],
    sanrenpuku:useMy&&my.sanrenpuku?.length?my.sanrenpuku:auto.sanrenpuku||[],
    comment:`相談内容を確認。${auto.ruleComment||"自動予想の構造を基準に判定"}`,
    ruleComment:`予想ルール判定: ${auto.type||"未判定"}。5系接続、◎連動、中位人気、上位人気差を優先。自分予想が入力されている場合は、その買い目を検証対象として返却。`
  };
}
export default{
  async fetch(request,env){
    if(request.method==="OPTIONS")return json({ok:true});
    const url=new URL(request.url);
    try{
      if(url.pathname==="/api/health")return json({ok:true,name:"rev-full-auto-enhanced-worker",time:new Date().toISOString()});
      if(url.pathname==="/api/schedule"){
        if(env.RACES_KV){const saved=await env.RACES_KV.get("schedule:latest","json");if(saved)return json({ok:true,races:saved});}
        return json({ok:true,mode:"sample",note:"本物データ取得Workerに差し替えるまではサンプルを返します",races:sampleRaces()});
      }
      if(url.pathname==="/api/results"){
        if(env.RACES_KV){const saved=await env.RACES_KV.get("results:latest","json");if(saved)return json({ok:true,results:saved});}
        return json({ok:true,mode:"sample",results:sampleResults()});
      }
      if(url.pathname==="/api/advice"){
        if(request.method!=="POST")return json({ok:false,error:"POST only"},405);
        const body=await request.json().catch(()=>({}));
        if(env.AI){
          const prompt=`あなたは競馬予想ルール判定AIです。必ずJSONのみで返してください。\n必要キー: decision, confidence, axis, umaren, sanrenpuku, comment, ruleComment。\n判定基準: 5系接続、◎連動、中位人気、S型/A型/B型、勝負/見送り。\n入力:${JSON.stringify(body)}`;
          const aiRes=await env.AI.run("@cf/meta/llama-3.1-8b-instruct",{messages:[{role:"user",content:prompt}]});
          const text=aiRes.response||aiRes.result?.response||JSON.stringify(aiRes);
          const m=text.match(/\{[\s\S]*\}/);
          if(m){try{return json({ok:true,answer:JSON.parse(m[0]),raw:text});}catch{}}
          return json({ok:true,answer:localAdvice(body),raw:text,warning:"AI returned non JSON. fallback used"});
        }
        return json({ok:true,answer:localAdvice(body),mode:"fallback_no_ai_binding"});
      }
      if(url.pathname==="/api/save-schedule"&&request.method==="POST"){
        if(!env.RACES_KV)return json({ok:false,error:"RACES_KV binding missing"},500);
        const body=await request.json();await env.RACES_KV.put("schedule:latest",JSON.stringify(body.races||body));return json({ok:true});
      }
      if(url.pathname==="/api/save-results"&&request.method==="POST"){
        if(!env.RACES_KV)return json({ok:false,error:"RACES_KV binding missing"},500);
        const body=await request.json();await env.RACES_KV.put("results:latest",JSON.stringify(body.results||body));return json({ok:true});
      }
      return json({ok:false,error:"not found",paths:["/api/health","/api/schedule","/api/results","/api/advice"]},404);
    }catch(e){return json({ok:false,error:String(e&&e.message?e.message:e)},500);}
  }
};
