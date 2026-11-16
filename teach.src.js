/* The teaching layer: why a move is good or bad, opening ideas and continuations.
   Everything here is derived from the position by rule; the engine supplies the moves. */
"use strict";

/* ---------- who attacks what ---------- */
function sqOf(r, f){ return "abcdefgh"[f]+(8-r); }
function attackersOf(g, sq, color){
  var out = [], bd = g.board(), tf = sq.charCodeAt(0)-97, tr = 8-parseInt(sq[1],10);
  for(var r=0;r<8;r++) for(var f=0;f<8;f++){
    var p = bd[r][f]; if(!p || p.color!==color) continue;
    var dr = tr-r, df = tf-f, ar = Math.abs(dr), af = Math.abs(df);
    if(!dr && !df) continue;
    var hit = false, t = p.type;
    if(t==="n") hit = (ar===1&&af===2)||(ar===2&&af===1);
    else if(t==="k") hit = Math.max(ar,af)===1;
    else if(t==="p") hit = af===1 && dr===(color==="w"?-1:1);
    else {
      var diag = ar===af, line = dr===0||df===0;
      if((t==="b"&&diag)||(t==="r"&&line)||(t==="q"&&(diag||line))){
        var sr = dr===0?0:dr/ar, sf = df===0?0:df/af, rr = r+sr, ff = f+sf; hit = true;
        while(rr!==tr || ff!==tf){ if(bd[rr][ff]){ hit = false; break; } rr += sr; ff += sf; }
      }
    }
    if(hit) out.push({sq:sqOf(r,f), type:t});
  }
  return out;
}
function other(c){ return c==="w"?"b":"w"; }
/* a piece is "loose" when it is attacked and either nothing defends it or a cheaper piece attacks it */
function looseAt(g, sq){
  var p = g.get(sq); if(!p || p.type==="k") return null;
  var att = attackersOf(g, sq, other(p.color)); if(!att.length) return null;
  var def = attackersOf(g, sq, p.color);
  var cheapest = att.reduce(function(a,b){ return VAL[b.type]<VAL[a.type]?b:a; });
  if(!def.length) return {by:cheapest, undefended:true};
  if(VAL[cheapest.type] < VAL[p.type]) return {by:cheapest, undefended:false};
  return null;
}
function loosePieces(g, color, withPawns){
  var out = [], bd = g.board();
  for(var r=0;r<8;r++) for(var f=0;f<8;f++){
    var p = bd[r][f]; if(!p || p.color!==color || p.type==="k") continue;
    if(p.type==="p" && !withPawns) continue;
    var l = looseAt(g, sqOf(r,f)); if(l) out.push({sq:sqOf(r,f), type:p.type, by:l.by, undefended:l.undefended});
  }
  return out;
}
function homeMinors(g, color){   // knights and bishops still on their starting squares
  var rank = color==="w"?"1":"8", n = 0;
  [["b","n"],["g","n"],["c","b"],["f","b"]].forEach(function(x){
    var p = g.get(x[0]+rank); if(p && p.color===color && p.type===x[1]) n++;
  });
  return n;
}

/* ---------- why a move is good ---------- */
function explain(fen, uci){
  var g = new Chess(fen), me = g.turn(), opp = other(me);
  var from = uci.slice(0,2), to = uci.slice(2,4);
  var fullmove = parseInt(fen.split(" ")[5],10);
  var wasLoose = looseAt(g, from);
  var looseBefore = loosePieces(g, me, false).filter(function(x){ return x.sq!==from; });
  var m = g.move(uciToMove(uci)); if(!m) return [];
  var R = [];
  if(g.in_checkmate()){ R.push({t:"mate", x:"It is checkmate."}); return R; }
  if(m.flags.indexOf("k")>=0 || m.flags.indexOf("q")>=0)
    R.push({t:"castle", x:"Castling puts your king behind its pawns and brings the rook into the game."});
  if(m.captured){
    var defended = attackersOf(g, to, opp).length>0, vc = VAL[m.captured], vm = VAL[m.piece];
    if(!defended) R.push({t:"free", x:"It takes the "+PNAME[m.captured]+" on "+to+", which nothing defends."});
    else if(vc>vm) R.push({t:"win", x:"It takes a "+PNAME[m.captured]+" with a "+PNAME[m.piece]+": even if they take back, you come out ahead."});
    else if(vc===vm) R.push({t:"trade", x: m.captured===m.piece ? "It trades "+PNAME[m.piece]+"s." : "It trades your "+PNAME[m.piece]+" for their "+PNAME[m.captured]+"."});
    else R.push({t:"capture", x:"It takes the "+PNAME[m.captured]+" on "+to+"."});
  }
  if(m.promotion) R.push({t:"promote", x:"The pawn becomes a "+PNAME[m.promotion]+"."});
  if(wasLoose && !looseAt(g, to))
    R.push({t:"escape", x:"Your "+PNAME[m.piece]+" on "+from+" was attacked by the "+PNAME[wasLoose.by.type]+" on "+wasLoose.by.sq+"; this moves it to safety."});
  for(var i=0;i<looseBefore.length;i++){
    var h = looseBefore[i];
    if(!looseAt(g, h.sq)){ R.push({t:"defend", x:"It covers your "+PNAME[h.type]+" on "+h.sq+", which was attacked by the "+PNAME[h.by.type]+" on "+h.by.sq+"."}); break; }
  }
  // what the moved piece now attacks
  var targets = [], bd = g.board(), movedLoose = looseAt(g, to);
  if(!movedLoose){
    for(var r=0;r<8;r++) for(var f=0;f<8;f++){
      var p = bd[r][f]; if(!p || p.color!==opp || p.type==="k" || p.type==="p") continue;
      var s = sqOf(r,f);
      var hits = attackersOf(g, s, me).some(function(a){ return a.sq===to; });
      if(!hits) continue;
      var undef = attackersOf(g, s, opp).length===0;
      if(undef || VAL[p.type]>VAL[m.piece]) targets.push({sq:s, type:p.type, undef:undef});
    }
  }
  var check = g.in_check();
  if(targets.length + (check?1:0) >= 2){
    var names = targets.map(function(t){ return "the "+PNAME[t.type]+" on "+t.sq; });
    if(check) names.unshift("the king");
    R.push({t:"fork", x:"It attacks two things at once: "+names.slice(0,-1).join(", ")+" and "+names[names.length-1]+"."});
  } else if(targets.length===1){
    R.push({t:"threat", x:"It attacks the "+PNAME[targets[0].type]+" on "+targets[0].sq+(targets[0].undef?", which nothing defends.":".")});
  } else if(check){
    R.push({t:"check", x:"It gives check."});
  }
  if(fullmove<=12){
    var home = me==="w"?"1":"8";
    if((m.piece==="n"||m.piece==="b") && from[1]===home && !m.captured)
      R.push({t:"develop", x:"It brings your "+PNAME[m.piece]+" off the back rank and into the game."});
    if(m.piece==="p" && ["d4","e4","d5","e5"].indexOf(to)>=0 && !m.captured)
      R.push({t:"centre", x:"It puts a pawn in the centre and opens lines for your pieces."});
  }
  if(!R.length) R.push({t:"quiet", x:"A quiet move that improves your position without a direct threat."});
  return R;
}
var CLUE = {
  mate:"There is a checkmate here. Look at every check you can give.",
  free:"One of their pieces has no defender. Which one, and can you take it?",
  win:"You can take something worth more than the piece you take it with.",
  trade:"A trade is the right idea here. Which pieces can come off?",
  capture:"There is a capture that works. Count who takes back.",
  promote:"A pawn of yours is close to the last rank.",
  escape:"One of your pieces is under attack. Which one, and where is it safe?",
  defend:"One of your pieces is attacked and needs cover. Which one?",
  fork:"One move attacks two of their pieces at once. Knights and queens do this best.",
  threat:"You can attack one of their pieces and make them react.",
  check:"A check here helps you. Which checks do you have?",
  castle:"Is your king safe yet?",
  develop:"Which of your pieces is still asleep on the back rank?",
  centre:"Think about the four squares in the middle of the board.",
  quiet:"No tactic here. Which of your pieces is doing the least, and where would it do more?"
};

/* ---------- what a weak move gave up ---------- */
function principles(fen, uci){
  var g = new Chess(fen), me = g.turn(), W = [];
  var from = uci.slice(0,2), to = uci.slice(2,4), parts = fen.split(" ");
  var fullmove = parseInt(parts[5],10), rights = parts[2];
  var canCastle = me==="w" ? /[KQ]/.test(rights) : /[kq]/.test(rights);
  var p = g.get(from), minorsHome = homeMinors(g, me), wasLoose = looseAt(g, from);
  var looseBefore = loosePieces(g, me, false).map(function(x){ return x.sq; });
  var m = g.move(uciToMove(uci)); if(!m) return W;
  var castled = m.flags.indexOf("k")>=0 || m.flags.indexOf("q")>=0;
  if(p.type==="k" && !castled && canCastle) W.push("Moving the king gives up the right to castle, so it stays in the middle where it is easiest to attack.");
  if(p.type==="q" && fullmove<=8 && minorsHome>=3 && !m.captured) W.push("The queen is out before your knights and bishops. It can be chased around while the other side develops for free.");
  if((p.type==="n"||p.type==="b") && fullmove<=10 && from[1]!==(me==="w"?"1":"8") && minorsHome>=2 && !wasLoose && !m.captured)
    W.push("You moved the same piece again while "+minorsHome+" of your knights and bishops still wait on the back rank.");
  if(p.type==="p" && (from[0]==="a"||from[0]==="h") && fullmove<=6 && !m.captured) W.push("A pawn move on the edge does nothing for the centre or for getting your pieces out.");
  if(p.type==="p" && from[0]==="f" && fullmove<=10 && canCastle && !m.captured) W.push("Moving the f-pawn opens the diagonal that leads to your own king.");
  if(p.type==="n" && (to[0]==="a"||to[0]==="h") && !m.captured) W.push("A knight on the edge reaches half the squares it would from the centre.");
  loosePieces(g, me, false).forEach(function(x){
    if(looseBefore.indexOf(x.sq)<0 || x.sq===to)
      W.push("It leaves your "+PNAME[x.type]+" on "+x.sq+" attacked by the "+PNAME[x.by.type]+" on "+x.by.sq+(x.undefended?" with nothing defending it.":", a cheaper piece."));
  });
  return W.slice(0,2);
}

/* ---------- the opening book ---------- */
var BOOK = {c:{}, n:null, k:0};
(function(){
  Object.keys(OPENINGS).forEach(function(key){
    var node = BOOK;
    key.split(" ").forEach(function(mv){ node = node.c[mv] || (node.c[mv] = {c:{}, n:null, k:0}); node.k++; });
    node.n = OPENINGS[key];
  });
})();
function bookNodeFor(sans){
  var node = BOOK;
  for(var i=0;i<sans.length;i++){ node = node.c[sans[i].replace(/[+#]/g,"")]; if(!node) return null; }
  return node;
}
function topChild(node){
  var best = null; Object.keys(node.c).forEach(function(mv){ if(!best || node.c[mv].k>node.c[best].k) best = mv; });
  return best;
}
function firstName(node){ var n = node, guard = 0; while(n && !n.n && guard++<12){ var t = topChild(n); n = t?n.c[t]:null; } return n?n.n:""; }
function bookMoves(node, max){
  return Object.keys(node.c).map(function(mv){ return {san:mv, name:node.c[mv].n||firstName(node.c[mv]), k:node.c[mv].k}; })
    .sort(function(a,b){ return b.k-a.k; }).slice(0, max);
}
function mainLine(node, plies){
  var out = [], n = node;
  while(n && out.length<plies){ var t = topChild(n); if(!t) break; out.push(t); n = n.c[t]; }
  return out;
}
function family(name){ return name.split(":")[0].replace(/,.*$/,"").trim(); }

var IDEAS = {
"King's Pawn Game":"1. e4 takes the centre and opens the queen and a bishop at once. Games tend to be open and tactical.",
"King's Pawn Opening":"1. e4 takes the centre and opens the queen and a bishop at once. Games tend to be open and tactical.",
"Queen's Pawn Game":"1. d4 takes the centre with a pawn the queen already protects. Games tend to be slower and built on pawn structure.",
"King's Knight Opening":"2. Nf3 develops a piece and attacks the e5 pawn, so Black must answer it.",
"Italian Game":"White aims the bishop at f7, the weakest point in Black's camp, then castles and builds a centre with c3 and d4.",
"Ruy Lopez":"The bishop on b5 pressures the knight that guards e5. White plays for a long squeeze: castle, c3, d4.",
"Scotch Game":"White opens the centre at once with d4, trading a pawn to get free, active pieces.",
"Four Knights Game":"Both sides bring out both knights first. Solid and symmetrical; the fight for d4 and d5 decides it.",
"Three Knights Opening":"White develops a third knight before committing the bishop. Often turns into the Four Knights.",
"Petrov's Defense":"Black answers the attack on e5 by attacking e4. Very solid; many pieces get traded early.",
"Philidor Defense":"Black guards e5 with a pawn. Solid but cramped: the dark bishop is shut in behind it.",
"Vienna Game":"2. Nc3 keeps the f-pawn free, so White can play f4 later and attack down the f-file.",
"Bishop's Opening":"The bishop eyes f7 before the knight comes out, keeping the f-pawn free to advance.",
"Center Game":"White trades the d-pawn at once and brings the queen out early; Black gains time by chasing it.",
"Danish Gambit":"White gives one or two pawns to get both bishops aimed at Black's king.",
"Danish Gambit Accepted":"White gives one or two pawns to get both bishops aimed at Black's king.",
"King's Gambit":"White offers the f-pawn to pull Black's e-pawn away, take the centre with d4 and attack down the f-file.",
"King's Gambit Accepted":"Black took the pawn. White wants d4, quick development and pressure on f7; Black tries to hold the extra pawn or give it back for safety.",
"King's Gambit Declined":"Black refuses the pawn and keeps the centre closed, often pointing a bishop at White's weakened king side.",
"Ponziani Opening":"3. c3 prepares d4 to build a big centre, at the cost of taking the knight's best square.",
"Latvian Gambit":"Black gambits the f-pawn on move two. Risky: it weakens Black's own king.",
"Elephant Gambit":"Black gives a centre pawn for fast development. Considered unsound, but tricky.",
"Sicilian Defense":"Black fights for d4 from the side with the c-pawn instead of copying e5. The positions are unbalanced: White usually attacks on the king side, Black on the queen side.",
"French Defense":"Black lets White have e4 and hits it with d5. Solid pawn chain; Black's light bishop is the problem piece, and c5 is the key break.",
"Caro-Kann Defense":"Like the French, Black supports d5, but with the c-pawn so the light bishop can still come out. Very solid.",
"Scandinavian Defense":"Black challenges e4 at once. After the trade the queen comes out early and White gains time attacking it.",
"Alekhine Defense":"Black tempts White's pawns forward, hoping to attack the big centre later.",
"Pirc Defense":"Black lets White build a centre, fianchettoes the bishop on g7, and strikes back later.",
"Modern Defense":"Black fianchettoes first and decides on the centre later. Flexible but gives White space.",
"Nimzowitsch Defense":"Black develops the knight to c6 against 1. e4. Offbeat; the knight can get in the c-pawn's way.",
"Owen Defense":"Black fianchettoes the queen's bishop to press on e4 from a distance.",
"Queen's Gambit":"White offers the c-pawn to pull Black's d-pawn off the centre. It is not a true gambit: the pawn can be won back.",
"Queen's Gambit Accepted":"Black takes the pawn. White gets a free hand in the centre with e4 or e3 and wins the pawn back; Black uses the time to develop.",
"Queen's Gambit Declined":"Black holds d5 with e6. Very solid; the light bishop on c8 is hard to activate.",
"Slav Defense":"Black holds d5 with c6, keeping the light bishop's diagonal open.",
"Semi-Slav Defense":"Black plays both c6 and e6: a rock-solid triangle of pawns, with sharp play if White pushes.",
"Tarrasch Defense":"Black hits the centre with c5 and accepts an isolated d-pawn in return for active pieces.",
"London System":"White sets up the same way against almost anything: bishop to f4, pawns on d4, e3 and c3. Solid and easy to learn.",
"Colle System":"White builds d4, e3, Bd3 and aims for the e4 break. Simple and solid.",
"Torre Attack":"White pins or pressures the f6 knight with Bg5 and builds a solid d4-e3 centre.",
"Trompowsky Attack":"White plays Bg5 on move two, ready to take the knight and damage Black's pawns.",
"Catalan Opening":"A Queen's Gambit with the bishop on g2, pressing down the long diagonal at Black's queen side.",
"Indian Defense":"Black stops e4 with the knight instead of a pawn and keeps the pawn structure flexible.",
"King's Indian Defense":"Black lets White take the whole centre, castles fast behind the g7 bishop, then hits back with e5 or c5 and attacks the king.",
"Nimzo-Indian Defense":"Black pins the c3 knight to stop e4, and is ready to give the bishop to double White's pawns.",
"Queen's Indian Defense":"Black fianchettoes the queen's bishop to control e4 from a distance.",
"Bogo-Indian Defense":"Black checks with the bishop to develop quickly and trade a piece.",
"Grünfeld Defense":"Black lets White build a big centre and then attacks it with pieces and c5.",
"Benoni Defense":"Black trades for an unbalanced structure: White gets the centre, Black a queen-side pawn majority and the g7 bishop.",
"Benko Gambit":"Black gives a queen-side pawn for long-term pressure down the open a- and b-files.",
"Dutch Defense":"Black takes e4 with the f-pawn and plays for a king-side attack, at some risk to the king.",
"Old Indian Defense":"Black builds a solid, slightly passive centre with d6 and e5, the bishop staying on e7.",
"Englund Gambit":"Black gives the e-pawn on move one, hoping for traps. Unsound if White just develops.",
"Blackmar-Diemer Gambit":"White gives a pawn for open lines and a fast attack.",
"Richter-Veresov Attack":"White develops Nc3 and Bg5 quickly and aims for e4.",
"English Opening":"1. c4 fights for d5 from the side. Often a Sicilian with colours reversed and an extra move.",
"Zukertort Opening":"1. Nf3 develops, stops e5 and keeps every pawn plan open.",
"Réti Opening":"White attacks Black's d5 pawn from the side with c4 and fianchettoes, controlling the centre with pieces.",
"King's Indian Attack":"White uses the King's Indian set-up with an extra move: Nf3, g3, Bg2, castle, then e4.",
"Bird Opening":"1. f4 controls e5, like a Dutch with colours reversed. It loosens White's king a little.",
"Nimzo-Larsen Attack":"White fianchettoes the queen's bishop first to press on e5 and the long diagonal.",
"Hungarian Opening":"1. g3 fianchettoes the king's bishop first and keeps the centre flexible.",
"Polish Opening":"1. b4 grabs queen-side space and prepares Bb2. Offbeat.",
"Van Geet Opening":"1. Nc3 develops but blocks the c-pawn. Often turns into another opening.",
"Van't Kruijs Opening":"1. e3 is quiet and flexible but gives Black a free hand in the centre.",
"Mieses Opening":"1. d3 is quiet; White often heads for a King's Indian Attack set-up.",
"Barnes Opening":"1. f3 takes the knight's best square and opens the diagonal to your own king. It is one of the weakest first moves; e4 or d4 does more.",
"Grob Opening":"1. g4 weakens the king side at once. Tricky, but objectively poor.",
"Ware Opening":"1. a4 does nothing for the centre or development.",
"Kádas Opening":"1. h4 does nothing for the centre or development.",
"Amar Opening":"1. Nh3 puts the knight on the edge, where it controls few squares.",
"Anderssen's Opening":"1. a3 is a waiting move; it gives Black the first say in the centre.",
"Clemenz Opening":"1. h3 is a waiting move; it gives Black the first say in the centre.",
"Sodium Attack":"1. Na3 puts the knight on the edge, where it controls few squares.",
"Saragossa Opening":"1. c3 is quiet; it supports d4 but takes the knight's natural square.",
"Carr Defense":"1... h6 does nothing for the centre or development.",
"Borg Defense":"1... g5 weakens Black's king side at once.",
"St. George Defense":"1... a6 prepares b5 and a queen-side fianchetto. Offbeat.",
"Rat Defense":"Black plays d6 first and keeps the set-up flexible."
};
function ideaFor(name){ return IDEAS[family(name)] || IDEAS[name.split(",")[0].split(":")[0].trim()] || ""; }
