const { useState, useRef, useCallback } = React;

// Persistence — pulled from window.DB set by index.html
const { lsSave, lsLoad, dbLoad, dbSave, supabaseConfigured } = window.DB || {
  lsSave: () => {}, lsLoad: () => null, dbLoad: async () => null,
  dbSave: async () => {}, supabaseConfigured: () => false
};

const FontLink = () => (
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Sans+3:wght@400;500;600;700&family=Roboto+Mono:wght@400;600&display=swap" rel="stylesheet" />
);
const DISPLAY = "'Playfair Display', Georgia, serif";
const BODY = "'Source Sans 3', system-ui, sans-serif";
const MONO = "'Roboto Mono', monospace";

const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
const toInt = (v) => (isNaN(parseInt(v)) ? 0 : parseInt(v));

// Baseball IP math: 1.2 means 1 full inning + 2 outs, NOT 1.2 decimal innings
// Convert baseball IP notation to outs, add, then convert back
const ipToOuts = (ip) => { const n = toNum(ip); const full = Math.floor(n); const outs = Math.round((n - full) * 10); return full * 3 + outs; };
const outsToIp = (outs) => { const full = Math.floor(outs / 3); const rem = outs % 3; return parseFloat(`${full}.${rem}`); };
const addIp = (...ips) => outsToIp(ips.reduce((sum, ip) => sum + ipToOuts(ip), 0));
const avg = (hits, abs) => (abs === 0 ? ".000" : (hits / abs).toFixed(3).replace(/^0/, ""));
const totalBases = (h, doubles, triples, hr) => toNum(h) + toNum(doubles) + 2*toNum(triples) + 3*toNum(hr);
const slg = (h, doubles, triples, hr, abs) => (abs === 0 ? ".000" : (totalBases(h,doubles,triples,hr) / abs).toFixed(3).replace(/^0/, ""));
const ops = (obpStr, slgStr) => (parseFloat(obpStr||0) + parseFloat(slgStr||0)).toFixed(3).replace(/^0/, "");
const ipToDecimal = (ip) => { const n = toNum(ip); const full = Math.floor(n); const outs = Math.round((n - full) * 10); return full + outs / 3; };
const era = (er, ip) => { const d = ipToDecimal(ip); return d === 0 ? "0.00" : ((er * 9) / d).toFixed(2); };
const whip = (bb, h, ip) => { const d = ipToDecimal(ip); return d === 0 ? "0.00" : ((bb + h) / d).toFixed(2); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const fmtDate = (d) => { if (!d) return "—"; const [y, m, day] = d.split("-"); return `${m}/${day}/${y}`; };

function initTeam(name, extra = {}) {
  return {
    name, coach: "", division: "",
    schedule: [],
    games: [],
    hitting: { ab: 0, h: 0, r: 0, rbi: 0, hr: 0, bb: 0, so: 0, "2b": 0, "3b": 0, sb: 0 },
    pitching: { ip: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, w: 0, l: 0, sv: 0 },
    wins: 0, losses: 0,
    ...extra,
  };
}

// ── Team identity (colors + badge initials) ────────────────────────────────────
const TEAM_META = {
  "Lakeside (Seattle)":  { bg: "#8B0000", text: "#FFD700", init: "LS" },
  "Lincoln (Seattle)":   { bg: "#003087", text: "#C8A400", init: "LN" },
  "Seattle Academy":     { bg: "#00539B", text: "#FFFFFF", init: "SA" },
  "West Seattle":        { bg: "#CC0000", text: "#FFFFFF", init: "WS" },
  "Seattle Prep.":       { bg: "#1A1A6E", text: "#C41230", init: "SP" },
  "Chief Sealth":        { bg: "#006633", text: "#FFFFFF", init: "CS" },
  "Rainier Beach":       { bg: "#0033A0", text: "#FFD100", init: "RB" },
  "O'Dea":               { bg: "#002147", text: "#C5A028", init: "OD" },
  "Nathan Hale":         { bg: "#CC0000", text: "#000000", init: "NH" },
  "Ballard":             { bg: "#003087", text: "#FFC72C", init: "BA" },
  "Ingraham":            { bg: "#006633", text: "#FFD700", init: "IN" },
  "Eastside Catholic":   { bg: "#003087", text: "#C8A400", init: "EC" },
  "Cleveland":           { bg: "#CC0000", text: "#FFFFFF", init: "CL" },
  "Bishop Blanchet":     { bg: "#003087", text: "#A7884A", init: "BB" },
  "Franklin":            { bg: "#000000", text: "#FFD700", init: "FR" },
  "Roosevelt":           { bg: "#8B0000", text: "#FFFFFF", init: "RO" },
  "Garfield":            { bg: "#000080", text: "#FFD700", init: "GA" },
};

// ── Team logos (base64 images) ─────────────────────────────────────────────────
const TEAM_LOGOS = window.__TEAM_LOGOS__;

// ── Full hard-coded schedule for all league teams ──────────────────────────────
// Format: { date, time, opponent, isHome, location, type }
// "isHome" = true means this team is the HOME team
const SCHEDULES = {
  "Lakeside (Seattle)": [
    { date:"2026-03-14", time:"12:00 pm", opponent:"Mark Morris",        isHome:false, location:"Mark Morris HS",              type:"" },
    { date:"2026-03-18", time:"6:30 pm",  opponent:"Auburn Riverside",   isHome:false, location:"Auburn Riverside HS",          type:"" },
    { date:"2026-03-20", time:"3:30 pm",  opponent:"Federal Way",        isHome:true,  location:"Lakeside HS (Seattle)",        type:"" },
    { date:"2026-03-23", time:"7:00 pm",  opponent:"O'Dea",              isHome:false, location:"Bannerwood Sports Pa",         type:"Conference" },
    { date:"2026-03-25", time:"4:00 pm",  opponent:"O'Dea",              isHome:true,  location:"Lakeside HS (Seattle)",        type:"Conference" },
    { date:"2026-03-27", time:"4:00 pm",  opponent:"Roosevelt",          isHome:true,  location:"Lakeside HS (Seattle)",        type:"Conference" },
    { date:"2026-03-30", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",         type:"Conference" },
    { date:"2026-04-06", time:"7:00 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Steve Cox Memorial P",         type:"Conference" },
    { date:"2026-04-08", time:"4:00 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"Loyal Heights CC",             type:"Conference" },
    { date:"2026-04-10", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Delridge",                    type:"Conference" },
    { date:"2026-04-10", time:"4:00 pm",  opponent:"Seattle Academy",    isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-13", time:"4:00 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:false, location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-17", time:"7:00 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-20", time:"4:00 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-24", time:"4:00 pm",  opponent:"Ballard",            isHome:false, location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-27", time:"5:00 pm",  opponent:"Ingraham",           isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-29", time:"4:00 pm",  opponent:"Garfield",           isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-30", time:"6:00 pm",  opponent:"Mercer Island",      isHome:false, location:"Island Crest Park",           type:"" },
    { date:"2026-05-02", time:"2:00 pm",  opponent:"Liberty (Renton)",   isHome:false, location:"Liberty HS",                  type:"" },
  ],
  "Lincoln (Seattle)": [
    { date:"2026-03-09", time:"4:15 pm",  opponent:"Lake Washington",    isHome:false, location:"University of Washington",    type:"Scrimmage" },
    { date:"2026-03-09", time:"5:15 pm",  opponent:"Bainbridge",         isHome:false, location:"University of Washington",    type:"" },
    { date:"2026-03-12", time:"4:00 pm",  opponent:"Bothell",            isHome:true,  location:"Lower Woodland Park",         type:"" },
    { date:"2026-03-13", time:"4:00 pm",  opponent:"Edmonds-Woodway",    isHome:true,  location:"Lower Woodland Park",         type:"" },
    { date:"2026-03-16", time:"4:30 pm",  opponent:"Newport",            isHome:false, location:"Newport HS",                  type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-03-25", time:"3:30 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-03-27", time:"3:45 pm",  opponent:"Garfield",           isHome:false, location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-03-30", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:false, location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-07", time:"4:00 pm",  opponent:"Snohomish",          isHome:false, location:"Snohomish HS",                type:"" },
    { date:"2026-04-08", time:"4:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-10", time:"3:30 pm",  opponent:"Roosevelt",          isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-13", time:"3:30 pm",  opponent:"O'Dea",              isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-15", time:"6:00 pm",  opponent:"O'Dea",              isHome:false, location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-17", time:"5:00 pm",  opponent:"Ingraham",           isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-20", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"West Seattle",       isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"O'Dea",              isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-29", time:"3:30 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"Lower Woodland",              type:"Conference" },
  ],
  "Seattle Academy": [
    { date:"2026-03-07", time:"1:00 pm",  opponent:"Redmond",            isHome:false, location:"SWAC",                        type:"Scrimmage" },
    { date:"2026-03-07", time:"3:00 pm",  opponent:"Kennedy Catholic",   isHome:false, location:"SWAC",                        type:"Scrimmage" },
    { date:"2026-03-10", time:"3:30 pm",  opponent:"TBD",                isHome:false, location:"",                            type:"Scrimmage" },
    { date:"2026-03-20", time:"4:00 pm",  opponent:"Tumwater",           isHome:false, location:"Heritage HS",                 type:"" },
    { date:"2026-03-23", time:"4:00 pm",  opponent:"Ballard",            isHome:false, location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-03-25", time:"3:30 pm",  opponent:"Chief Sealth",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-03-27", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-03-30", time:"3:45 pm",  opponent:"Garfield",           isHome:false, location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:false, location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:true,  location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"West Seattle",       isHome:true,  location:"Delridge",                    type:"Conference" },
    { date:"2026-04-08", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Delridge",                    type:"Conference" },
    { date:"2026-04-10", time:"3:30 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"Delridge",                    type:"Conference" },
    { date:"2026-04-10", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-13", time:"3:30 pm",  opponent:"Ingraham",           isHome:true,  location:"Delridge",                    type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"O'Dea",              isHome:true,  location:"Delridge",                    type:"Conference" },
    { date:"2026-04-20", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Delridge",                    type:"Conference" },
    { date:"2026-04-21", time:"6:00 pm",  opponent:"Mercer Island",      isHome:false, location:"Island Crest Park",           type:"" },
    { date:"2026-04-24", time:"6:00 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Delridge",                    type:"Conference" },
    { date:"2026-04-29", time:"3:30 pm",  opponent:"Franklin",           isHome:false, location:"Rainier Playfields",          type:"Conference" },
  ],
  "West Seattle": [
    { date:"2026-03-13", time:"7:00 pm",  opponent:"Sumner",             isHome:true,  location:"SWAC",                        type:"" },
    { date:"2026-03-14", time:"12:01 am", opponent:"Peninsula",          isHome:false, location:"Sehmel Homestead Par",        type:"" },
    { date:"2026-03-17", time:"4:00 pm",  opponent:"Kennedy Catholic",   isHome:false, location:"Kennedy Catholic HS",         type:"" },
    { date:"2026-03-23", time:"7:00 pm",  opponent:"Garfield",           isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-03-25", time:"2:30 pm",  opponent:"Cleveland",          isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-03-27", time:"4:00 pm",  opponent:"O'Dea",              isHome:false, location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-03-28", time:"11:00 am", opponent:"Gig Harbor",         isHome:false, location:"Sehmel Homestead Par",        type:"" },
    { date:"2026-03-30", time:"5:00 pm",  opponent:"Ingraham",           isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-03", time:"7:00 pm",  opponent:"Chief Sealth",       isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-04", time:"12:00 pm", opponent:"Issaquah",           isHome:false, location:"T-Mobile Park",               type:"" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Delridge",                    type:"Conference" },
    { date:"2026-04-08", time:"2:30 pm",  opponent:"Rainier Beach",      isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-10", time:"7:00 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-13", time:"4:00 pm",  opponent:"Roosevelt",          isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-15", time:"7:00 pm",  opponent:"Franklin",           isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-17", time:"7:00 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-20", time:"4:00 pm",  opponent:"Ballard",            isHome:false, location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-27", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-29", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Lower Woodland",              type:"Conference" },
  ],
  "Seattle Prep.": [
    { date:"2026-03-10", time:"3:30 pm",  opponent:"TBD",                isHome:false, location:"Steve Cox Memorial P",        type:"" },
    { date:"2026-03-10", time:"4:00 pm",  opponent:"Mountlake Terrace",  isHome:false, location:"Mountlake Terrace HS",        type:"" },
    { date:"2026-03-13", time:"7:00 pm",  opponent:"Kennedy Catholic",   isHome:false, location:"Gonzaga University",          type:"" },
    { date:"2026-03-14", time:"10:00 am", opponent:"Mount Si",           isHome:false, location:"Gonzaga University",          type:"" },
    { date:"2026-03-20", time:"5:00 pm",  opponent:"King's",             isHome:false, location:"Shorewood HS",                type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-03-25", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-03-27", time:"3:30 pm",  opponent:"Ingraham",           isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-03-30", time:"4:00 pm",  opponent:"O'Dea",              isHome:false, location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"O'Dea",              isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-06", time:"7:00 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-08", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:false, location:"Loyal Heights CC",            type:"Conference" },
    { date:"2026-04-10", time:"7:00 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-13", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-15", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-20", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:false, location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-22", time:"7:00 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-24", time:"6:00 pm",  opponent:"Seattle Academy",    isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Garfield",           isHome:false, location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-29", time:"7:00 pm",  opponent:"Ballard",            isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
  ],
  "Chief Sealth": [
    { date:"2026-03-10", time:"3:30 pm",  opponent:"Cedarcrest",         isHome:false, location:"SWAC",                        type:"Scrimmage" },
    { date:"2026-03-10", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:false, location:"SWAC",                        type:"Scrimmage" },
    { date:"2026-03-12", time:"3:30 pm",  opponent:"Sultan",             isHome:false, location:"Sultan HS",                   type:"" },
    { date:"2026-03-19", time:"4:30 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"SWAC",                        type:"" },
    { date:"2026-03-21", time:"12:00 pm", opponent:"Eisenhower",         isHome:false, location:"Eisenhower HS",               type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Cleveland",          isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-03-25", time:"5:00 pm",  opponent:"Seattle Academy",    isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-03-27", time:"7:00 pm",  opponent:"Cleveland",          isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-03-28", time:"1:00 pm",  opponent:"Othello",            isHome:false, location:"Othello HS",                  type:"" },
    { date:"2026-03-30", time:"3:30 pm",  opponent:"Nathan Hale (conf)", isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-01", time:"5:00 pm",  opponent:"Ingraham",           isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-03", time:"7:00 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:true,  location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-08", time:"5:00 pm",  opponent:"Garfield",           isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-10", time:"4:00 pm",  opponent:"Nathan Hale",        isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-13", time:"7:00 pm",  opponent:"Franklin",           isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-15", time:"4:00 pm",  opponent:"Ballard",            isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-20", time:"7:00 pm",  opponent:"Rainier Beach",      isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-27", time:"7:00 pm",  opponent:"Seattle Christian",  isHome:true,  location:"SWAC",                        type:"" },
    { date:"2026-04-28", time:"7:00 pm",  opponent:"Seattle Christian",  isHome:true,  location:"SWAC",                        type:"" },
  ],
  "Rainier Beach": [
    { date:"2026-03-25", time:"3:30 pm",  opponent:"Ingraham",           isHome:true,  location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-03-30", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:true,  location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:true,  location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-04-03", time:"3:45 pm",  opponent:"Garfield",           isHome:true,  location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-08", time:"2:30 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-10", time:"3:30 pm",  opponent:"Franklin",           isHome:false, location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-04-13", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-20", time:"7:00 pm",  opponent:"Chief Sealth",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Ballard",            isHome:false, location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Chief Sealth",       isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-24", time:"12:01 am", opponent:"Franklin (conf)",    isHome:false, location:"Rainier Beach Playfi",        type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:false, location:"Brighton Playfield",          type:"Conference" },
  ],
  "O'Dea": [
    { date:"2026-03-11", time:"6:00 pm",  opponent:"Tahoma",             isHome:true,  location:"Bannerwood Sports Pa",        type:"" },
    { date:"2026-03-13", time:"5:00 pm",  opponent:"Camas",              isHome:true,  location:"Bannerwood Sports Pa",        type:"" },
    { date:"2026-03-16", time:"7:00 pm",  opponent:"Arlington",          isHome:true,  location:"Bannerwood Sports Pa",        type:"" },
    { date:"2026-03-19", time:"6:30 pm",  opponent:"Thomas Jefferson",   isHome:true,  location:"Bannerwood Sports Pa",        type:"" },
    { date:"2026-03-23", time:"7:00 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-03-25", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:false, location:"Lakeside HS (Seattle)",       type:"Conference" },
    { date:"2026-03-27", time:"4:00 pm",  opponent:"West Seattle",       isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-03-30", time:"4:00 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-06", time:"4:00 pm",  opponent:"Bishop Blanchet",    isHome:false, location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-08", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-10", time:"4:00 pm",  opponent:"Ballard",            isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-13", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-15", time:"6:00 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Delridge",                    type:"Conference" },
    { date:"2026-04-20", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-22", time:"5:30 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-29", time:"5:00 pm",  opponent:"Ingraham",           isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-30", time:"4:00 pm",  opponent:"Garfield",           isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
  ],
  "Nathan Hale": [
    { date:"2026-03-10", time:"3:30 pm",  opponent:"Chief Sealth",       isHome:true,  location:"SWAC",                        type:"Scrimmage" },
    { date:"2026-03-10", time:"3:30 pm",  opponent:"Cedarcrest",         isHome:true,  location:"SWAC",                        type:"Scrimmage" },
    { date:"2026-03-11", time:"6:30 pm",  opponent:"Stanwood",           isHome:false, location:"Stanwood HS",                 type:"" },
    { date:"2026-03-17", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-03-14", time:"1:00 pm",  opponent:"Bellingham",         isHome:false, location:"Bellingham HS",               type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-03-25", time:"4:00 pm",  opponent:"Ballard",            isHome:false, location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-03-30", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Chief Sealth",       isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-08", time:"5:00 pm",  opponent:"Ingraham",           isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-10", time:"4:00 pm",  opponent:"Chief Sealth",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-13", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:true,  location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Garfield",           isHome:true,  location:"Garfield HS",                 type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-20", time:"3:30 pm",  opponent:"Cleveland",          isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-21", time:"7:00 pm",  opponent:"Shorecrest",         isHome:false, location:"Shorecrest HS",               type:"" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"West Seattle",       isHome:true,  location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-25", time:"2:00 pm",  opponent:"Shorewood",          isHome:false, location:"Meridian Park Field",         type:"" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:true,  location:"Brighton Playfield",          type:"Conference" },
  ],
  "Ballard": [
    { date:"2026-03-11", time:"4:15 pm",  opponent:"TBD",                isHome:true,  location:"TBA",                         type:"Scrimmage" },
    { date:"2026-03-11", time:"4:15 pm",  opponent:"Roosevelt",          isHome:false, location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-11", time:"6:45 pm",  opponent:"Garfield",           isHome:false, location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-11", time:"5:30 pm",  opponent:"Roosevelt",          isHome:false, location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-19", time:"4:00 pm",  opponent:"Redmond",            isHome:true,  location:"Whitman Middle Schoo",        type:"" },
    { date:"2026-03-20", time:"4:00 pm",  opponent:"Shorewood",          isHome:true,  location:"Whitman Middle Schoo",        type:"" },
    { date:"2026-03-23", time:"4:00 pm",  opponent:"Seattle Academy",    isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-03-25", time:"4:00 pm",  opponent:"Nathan Hale",        isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-03-27", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Lower Woodland",              type:"Conference" },
    { date:"2026-03-30", time:"4:00 pm",  opponent:"Roosevelt",          isHome:false, location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-06", time:"5:00 pm",  opponent:"Ingraham",           isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-08", time:"4:00 pm",  opponent:"Cleveland",          isHome:false, location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-10", time:"4:00 pm",  opponent:"O'Dea",              isHome:false, location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-13", time:"3:45 pm",  opponent:"Garfield",           isHome:true,  location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-15", time:"4:00 pm",  opponent:"Chief Sealth",       isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-04-17", time:"4:00 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-20", time:"4:00 pm",  opponent:"West Seattle",       isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:true,  location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-04-24", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-25", time:"9:00 am",  opponent:"Auburn Riverside",   isHome:false, location:"T-Mobile Park",               type:"" },
    { date:"2026-04-28", time:"4:00 pm",  opponent:"Inglemoor",          isHome:true,  location:"Whitman Middle Schoo",        type:"" },
    { date:"2026-04-29", time:"7:00 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Steve Cox Memorial P",        type:"Conference" },
  ],
  "Ingraham": [
    { date:"2026-03-09", time:"4:00 pm",  opponent:"Shorewood",          isHome:false, location:"Shorewood HS",                type:"" },
    { date:"2026-03-09", time:"5:00 pm",  opponent:"Juanita",            isHome:false, location:"Shorewood HS",                type:"Scrimmage" },
    { date:"2026-03-12", time:"5:00 pm",  opponent:"Everett",            isHome:true,  location:"NWAC",                        type:"" },
    { date:"2026-03-16", time:"7:45 pm",  opponent:"Mercer Island",      isHome:true,  location:"Edmonds Community Co",        type:"" },
    { date:"2026-03-19", time:"5:00 pm",  opponent:"Bellevue",           isHome:true,  location:"NWAC",                        type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-03-25", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:false, location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-03-27", time:"3:30 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-03-30", time:"5:00 pm",  opponent:"West Seattle",       isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-01", time:"5:00 pm",  opponent:"Chief Sealth",       isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-06", time:"5:00 pm",  opponent:"Ballard",            isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-08", time:"5:00 pm",  opponent:"Nathan Hale",        isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-10", time:"5:00 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-13", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Delridge",                    type:"Conference" },
    { date:"2026-04-14", time:"10:00 am", opponent:"Jackson",            isHome:false, location:"NWAC",                        type:"" },
    { date:"2026-04-17", time:"5:00 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-20", time:"5:00 pm",  opponent:"Garfield",           isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-24", time:"4:00 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-27", time:"5:00 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"NWAC",                        type:"Conference" },
    { date:"2026-04-29", time:"5:00 pm",  opponent:"O'Dea",              isHome:false, location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-05-02", time:"12:00 pm", opponent:"North Thurston",     isHome:true,  location:"North Thurston HS",           type:"" },
  ],
  "Eastside Catholic": [
    { date:"2026-03-07", time:"12:00 pm", opponent:"Eastlake",           isHome:false, location:"Eastlake HS",                 type:"Scrimmage" },
    { date:"2026-03-11", time:"6:30 pm",  opponent:"Edmonds-Woodway",    isHome:true,  location:"Edmonds-Woodway HS",          type:"" },
    { date:"2026-03-14", time:"1:00 pm",  opponent:"Puyallup",           isHome:true,  location:"Eastside Catholic HS",        type:"" },
    { date:"2026-03-17", time:"7:00 pm",  opponent:"Nathan Hale",        isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-03-20", time:"7:00 pm",  opponent:"Everett",            isHome:true,  location:"Eastside Catholic HS",        type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:false, location:"Lower Woodland",              type:"Conference" },
    { date:"2026-03-25", time:"7:00 pm",  opponent:"Bishop Blanchet",    isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-03-27", time:"7:00 pm",  opponent:"Seattle Academy",    isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-03-30", time:"7:00 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-06", time:"4:00 pm",  opponent:"Lincoln (Seattle)",  isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-08", time:"4:00 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-10", time:"7:00 pm",  opponent:"Garfield",           isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-13", time:"7:00 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-15", time:"7:00 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-20", time:"7:00 pm",  opponent:"O'Dea",              isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-22", time:"5:30 pm",  opponent:"O'Dea",              isHome:false, location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-24", time:"8:00 pm",  opponent:"Kennedy Catholic",   isHome:true,  location:"T-Mobile Park",               type:"Conference" },
    { date:"2026-04-27", time:"7:00 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-29", time:"7:00 pm",  opponent:"Roosevelt",          isHome:true,  location:"Eastside Catholic HS",        type:"Conference" },
  ],
  "Cleveland": [
    { date:"2026-03-11", time:"6:00 pm",  opponent:"Auburn Riverside",   isHome:false, location:"Auburn Riverside HS",         type:"" },
    { date:"2026-03-13", time:"3:30 pm",  opponent:"Seattle Christian",  isHome:true,  location:"Jefferson Playfield",         type:"" },
    { date:"2026-03-14", time:"11:30 am", opponent:"Franklin",           isHome:false, location:"Sammamish HS",                type:"Conference" },
    { date:"2026-03-14", time:"1:00 pm",  opponent:"Sammamish",          isHome:false, location:"Sammamish HS",                type:"Conference" },
    { date:"2026-03-16", time:"3:30 pm",  opponent:"Lindbergh",          isHome:true,  location:"Jefferson Playfield",         type:"" },
    { date:"2026-03-19", time:"3:30 pm",  opponent:"Kent Meridian",      isHome:true,  location:"Jefferson Playfield",         type:"" },
    { date:"2026-03-20", time:"3:30 pm",  opponent:"Renton",             isHome:true,  location:"Jefferson Playfield",         type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Chief Sealth",       isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-03-25", time:"2:30 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-03-27", time:"7:00 pm",  opponent:"Chief Sealth",       isHome:true,  location:"SWAC",                        type:"Conference" },
    { date:"2026-03-30", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Garfield",           isHome:true,  location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-08", time:"4:00 pm",  opponent:"Ballard",            isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-11", time:"6:45 pm",  opponent:"Evergreen (Sea)",    isHome:false, location:"Steve Cox Memorial P",        type:"" },
    { date:"2026-04-13", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-20", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Ingraham",           isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:true,  location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Franklin",           isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-29", time:"3:30 pm",  opponent:"Franklin",           isHome:true,  location:"Rainier Playfields",          type:"Conference" },
  ],
  "Bishop Blanchet": [
    { date:"2026-03-10", time:"4:30 pm",  opponent:"Bothell",            isHome:false, location:"Bothell HS",                  type:"Scrimmage" },
    { date:"2026-03-10", time:"6:05 pm",  opponent:"Glacier Peak",       isHome:false, location:"Bothell HS",                  type:"Scrimmage" },
    { date:"2026-03-11", time:"6:30 pm",  opponent:"Inglemoor",          isHome:false, location:"Inglemoor HS",                type:"" },
    { date:"2026-03-16", time:"4:45 pm",  opponent:"Stadium",            isHome:true,  location:"Edmonds Community Co",        type:"Conference" },
    { date:"2026-03-19", time:"4:30 pm",  opponent:"Chief Sealth",       isHome:false, location:"SWAC",                        type:"" },
    { date:"2026-03-20", time:"7:15 pm",  opponent:"Mercer Island",      isHome:false, location:"Island Crest Park",           type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Eastside Catholic",  isHome:true,  location:"Lower Woodland",              type:"Conference" },
    { date:"2026-03-25", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-03-27", time:"3:30 pm",  opponent:"Ballard",            isHome:false, location:"Lower Woodland",              type:"Conference" },
    { date:"2026-03-30", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:false, location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-06", time:"4:00 pm",  opponent:"O'Dea",              isHome:true,  location:"Bannerwood Sports Pa",        type:"Conference" },
    { date:"2026-04-08", time:"3:30 pm",  opponent:"O'Dea",              isHome:false, location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-10", time:"5:00 pm",  opponent:"Ingraham",           isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-13", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Lakeside (Seattle)", isHome:true,  location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-17", time:"3:45 pm",  opponent:"Garfield",           isHome:true,  location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-20", time:"3:30 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"Lower Woodland",              type:"Conference" },
    { date:"2026-04-22", time:"7:00 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Delridge",                    type:"Conference" },
    { date:"2026-04-29", time:"3:30 pm",  opponent:"West Seattle",       isHome:false, location:"Lower Woodland",              type:"Conference" },
  ],
  "Franklin": [
    { date:"2026-03-14", time:"10:00 am", opponent:"Sammamish",          isHome:false, location:"Sammamish HS",                type:"Scrimmage" },
    { date:"2026-03-14", time:"11:30 am", opponent:"Cleveland",          isHome:true,  location:"Sammamish HS",                type:"Conference" },
    { date:"2026-03-17", time:"4:30 pm",  opponent:"Bellevue",           isHome:false, location:"Bellevue HS",                 type:"" },
    { date:"2026-03-18", time:"3:30 pm",  opponent:"Sammamish",          isHome:true,  location:"Rainier Playfields",          type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-03-25", time:"3:30 pm",  opponent:"Roosevelt",          isHome:true,  location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-03-27", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:true,  location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-03-30", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Ballard",            isHome:false, location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Ingraham",           isHome:false, location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:false, location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-08", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Delridge",                    type:"Conference" },
    { date:"2026-04-10", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:true,  location:"Brighton Playfield",          type:"Conference" },
    { date:"2026-04-13", time:"7:00 pm",  opponent:"Chief Sealth",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-14", time:"4:00 pm",  opponent:"Kent Meridian",      isHome:false, location:"Kent-Meridian HS",            type:"" },
    { date:"2026-04-15", time:"7:00 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Chief Sealth",       isHome:false, location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-21", time:"4:00 pm",  opponent:"Lynnwood",           isHome:true,  location:"Rainier Playfields",          type:"" },
    { date:"2026-04-22", time:"3:45 pm",  opponent:"Garfield",           isHome:true,  location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-24", time:"12:01 am", opponent:"Rainier Beach (conf)",isHome:true, location:"Rainier Beach Playfi",        type:"Conference" },
    { date:"2026-04-25", time:"2:00 pm",  opponent:"Liberty (Renton)",   isHome:false, location:"Liberty HS",                  type:"" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Cleveland",          isHome:true,  location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-29", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-04-29", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:true,  location:"Rainier Playfields",          type:"Conference" },
  ],
  "Roosevelt": [
    { date:"2026-03-11", time:"4:15 pm",  opponent:"Garfield",           isHome:false, location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-11", time:"5:30 pm",  opponent:"Ballard",            isHome:true,  location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-12", time:"3:30 pm",  opponent:"University Prep.",   isHome:true,  location:"Magnuson Park",               type:"" },
    { date:"2026-03-16", time:"4:30 pm",  opponent:"Bellevue",           isHome:false, location:"Bellevue HS",                 type:"" },
    { date:"2026-03-17", time:"4:00 pm",  opponent:"Meadowdale",         isHome:false, location:"Meadowdale HS",               type:"" },
    { date:"2026-03-20", time:"7:30 pm",  opponent:"Cedar Park Christian",isHome:false,location:"Bannerwood Sports Pa",        type:"" },
    { date:"2026-03-23", time:"3:30 pm",  opponent:"Ingraham",           isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-03-25", time:"3:30 pm",  opponent:"Franklin",           isHome:false, location:"Rainier Playfields",          type:"Conference" },
    { date:"2026-03-27", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:false, location:"Lakeside HS (Seattle)",       type:"Conference" },
    { date:"2026-03-30", time:"4:00 pm",  opponent:"Ballard",            isHome:true,  location:"Whitman Middle Schoo",        type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:false, location:"Meadowbrook Playfiel",        type:"Conference" },
    { date:"2026-04-03", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Jefferson Playfield",         type:"Conference" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Garfield",           isHome:true,  location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-07", time:"5:00 pm",  opponent:"Lake Washington",    isHome:false, location:"T-Mobile Park",               type:"" },
    { date:"2026-04-10", time:"3:30 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Lower Woodland Park",         type:"Conference" },
    { date:"2026-04-13", time:"4:00 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Rainier Beach",      isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-17", time:"3:30 pm",  opponent:"Seattle Prep.",      isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-20", time:"3:30 pm",  opponent:"Seattle Academy",    isHome:false, location:"Delridge",                    type:"Conference" },
    { date:"2026-04-22", time:"3:30 pm",  opponent:"Chief Sealth",       isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Bishop Blanchet",    isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"O'Dea",              isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-29", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
  ],
  "Garfield": [
    { date:"2026-03-11", time:"4:15 pm",  opponent:"Roosevelt",          isHome:true,  location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-11", time:"5:30 pm",  opponent:"Ballard",            isHome:true,  location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-11", time:"6:45 pm",  opponent:"Ballard",            isHome:true,  location:"Garfield Playfield",          type:"Scrimmage" },
    { date:"2026-03-13", time:"3:45 pm",  opponent:"Mountlake Terrace",  isHome:true,  location:"Garfield HS",                 type:"" },
    { date:"2026-03-16", time:"3:45 pm",  opponent:"Issaquah",           isHome:true,  location:"Garfield Playfield",          type:"" },
    { date:"2026-03-18", time:"4:15 pm",  opponent:"Newport",            isHome:false, location:"Newport HS",                  type:"" },
    { date:"2026-03-23", time:"7:00 pm",  opponent:"West Seattle",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-03-27", time:"3:45 pm",  opponent:"Lincoln (Seattle)",  isHome:true,  location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-03-30", time:"3:45 pm",  opponent:"Seattle Academy",    isHome:true,  location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-01", time:"3:30 pm",  opponent:"Cleveland",          isHome:false, location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-03", time:"3:45 pm",  opponent:"Rainier Beach",      isHome:false, location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-04", time:"9:00 am",  opponent:"Liberty (Renton)",   isHome:true,  location:"T-Mobile Park",               type:"" },
    { date:"2026-04-06", time:"3:30 pm",  opponent:"Roosevelt",          isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-08", time:"5:00 pm",  opponent:"Chief Sealth",       isHome:false, location:"SWAC",                        type:"Conference" },
    { date:"2026-04-10", time:"7:00 pm",  opponent:"Eastside Catholic",  isHome:false, location:"Eastside Catholic HS",        type:"Conference" },
    { date:"2026-04-13", time:"3:45 pm",  opponent:"Ballard",            isHome:false, location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-15", time:"3:30 pm",  opponent:"Nathan Hale",        isHome:false, location:"Garfield HS",                 type:"Conference" },
    { date:"2026-04-17", time:"3:45 pm",  opponent:"Bishop Blanchet",    isHome:false, location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-20", time:"5:00 pm",  opponent:"Ingraham",           isHome:false, location:"NWAC",                        type:"Conference" },
    { date:"2026-04-22", time:"3:45 pm",  opponent:"Franklin",           isHome:false, location:"Garfield Playfield",          type:"Conference" },
    { date:"2026-04-24", time:"3:30 pm",  opponent:"Eastside Catholic (conf)",isHome:true,location:"Eastside Catholic HS",     type:"Conference" },
    { date:"2026-04-27", time:"3:30 pm",  opponent:"Seattle Prep.",      isHome:true,  location:"Steve Cox Memorial P",        type:"Conference" },
    { date:"2026-04-29", time:"4:00 pm",  opponent:"Lakeside (Seattle)", isHome:false, location:"Magnuson Park",               type:"Conference" },
    { date:"2026-04-30", time:"4:00 pm",  opponent:"O'Dea",              isHome:false, location:"Bannerwood Sports Pa",        type:"Conference" },
  ],
};

// Build the pre-loaded teams array
function buildInitialTeams() {
  return Object.keys(TEAM_META).map(name => ({
    ...initTeam(name),
    schedule: (SCHEDULES[name] || []).map(g => ({ ...g })),
    color: TEAM_META[name],
  }));
}

const INITIAL_TEAMS = buildInitialTeams();

async function callClaude(messages, maxTokens = 1400) {
  // Call via Netlify proxy to avoid CORS
  const res = await fetch("/.netlify/functions/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API error ${res.status}`);
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = data.content?.find(b => b.type === "text")?.text || "{}";
  console.log("Claude raw response:", text.slice(0, 200));
  return text.replace(/```json|```/g, "").trim();
}

async function extractTeamsFromImage(b64, mediaType) {
  const raw = await callClaude([{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
    { type: "text", text: `Extract all baseball team names from this screenshot. Return ONLY valid JSON:\n{"teams":[{"name":"Team Name","coach":"Coach or empty","division":"Division or empty"}]}` }
  ]}]);
  return JSON.parse(raw);
}


async function extractPlayerStatsFromImage(b64, mediaType) {
  const prompt = `Extract individual player baseball stats from this screenshot for ONE team. Return ONLY valid JSON, no markdown:
{"teamName":"team name if visible else empty","hitters":[{"name":"Player Name","pos":"CF","ab":3,"r":1,"h":2,"rbi":1,"bb":0,"so":1,"2b":0,"3b":0,"hr":0,"sb":0}],"pitchers":[{"name":"Player Name","ip":5.0,"h":3,"r":1,"er":1,"bb":2,"so":5,"hr":0,"dec":"W"}]}
Extract EVERY player row visible. Use 0 for missing stats. dec = W, L, S, or empty string.
IMPORTANT: If there is a summary section below the table, it will have several lines, each starting with a label like "2B:", "3B:", "HR:", "SB:", "TB:", "CS:", "HBP:", "E:", etc.

STEP 1 — Only these four labels ever set hitter stats: "2B:", "3B:", "HR:", "SB:". Every other label (TB, CS, HBP, E, or anything else) must be completely skipped — do not read any names or numbers from those lines, for any purpose, under any circumstance. This applies even though a skipped line (especially "TB:") may LOOK identical in format to the four labels you do use — same comma-separated "Name" or "Name Count" structure. The label text itself, not the format, is what tells you whether to read a line. If a line's label is not exactly one of 2B/3B/HR/SB, treat it as if it were not there at all.

STEP 2 — For each of the 2B/3B/HR/SB lines only, parse its comma-separated list of names. Each name can appear in ONE of two ways:
  (a) Repeated plainly, e.g. "2B: Smith, Jones, Smith" → Smith gets 2b=2, Jones gets 2b=1.
  (b) Followed by a trailing count number (space before the number, no comma), e.g. "2B: Emmett Brown 2, Jacob Flores, Micah Houston" → THREE players: "Emmett Brown" 2b=2, "Jacob Flores" 2b=1, "Micah Houston" 2b=1. The trailing number multiplies that one name; it is not a separate player and not part of the name.
Apply this to whichever of 2B/3B/HR/SB the name appears on. A player not mentioned on a given line gets 0 for that stat.

Sanity check before finalizing each hitter: 2b + 3b + hr must never exceed their total h. If your parse would violate that, you misread a line — re-check whether the number actually came from a 2B/3B/HR/SB line and not from TB.

Match player names using last name if full name not found. Ignore jersey numbers.`;
  const raw = await callClaude([{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
    { type: "text", text: prompt }
  ]}], 1800);
  const parsed = JSON.parse(raw);

  // Hard safety net: 2B/3B/HR can never exceed H for a hitter (impossible in real baseball).
  // The AI extraction has repeatedly bled numbers from the TB summary line into 2B specifically,
  // even when explicitly told not to — so we clamp in code rather than relying on the prompt alone.
  // HR has proven reliable in testing, so it's trusted first, then 3B, then 2B is clamped last.
  if (Array.isArray(parsed.hitters)) {
    parsed.hitters = parsed.hitters.map(p => {
      const h = Number(p.h) || 0;
      let hr = Number(p.hr) || 0;
      let b3 = Number(p["3b"]) || 0;
      let b2 = Number(p["2b"]) || 0;
      if (hr > h) hr = h;
      if (b3 > h - hr) b3 = Math.max(0, h - hr);
      if (b2 > h - hr - b3) b2 = Math.max(0, h - hr - b3);
      return { ...p, hr, "3b": b3, "2b": b2 };
    });
  }

  return parsed;
}

// ── Team Badge ────────────────────────────────────────────────────────────────
function TeamBadge({ name, size = "md" }) {
  const meta = TEAM_META[name] || { bg: "#334155", text: "#ffffff", init: (name||"?").slice(0,2).toUpperCase() };
  const logo = TEAM_LOGOS[name];
  const sz = size === "lg" ? "w-12 h-12" : size === "sm" ? "w-7 h-7" : size === "xs" ? "w-5 h-5" : "w-9 h-9";
  const txtSz = size === "lg" ? "text-sm" : size === "xs" ? "text-[8px]" : "text-xs";
  const rounded = size === "xs" ? "rounded" : "rounded-lg";
  if (logo) {
    return (
      <div className={`${sz} ${rounded} flex-shrink-0 overflow-hidden border border-stone-200`}
        style={{ backgroundColor: "#ffffff" }}>
        <img src={logo} alt={name} className="w-full h-full object-contain p-0.5" />
      </div>
    );
  }
  return (
    <div className={`${sz} ${rounded} ${txtSz} flex items-center justify-center font-black flex-shrink-0`}
      style={{ backgroundColor: meta.bg, color: meta.text, fontFamily: DISPLAY, letterSpacing: "0.02em" }}>
      {meta.init}
    </div>
  );
}

// ── Shared UI ──────────────────────────────────────────────────────────────────
function Badge({ children, color = "green" }) {
  const c = {
    green:  "bg-emerald-100 text-emerald-800 border-emerald-200",
    red:    "bg-red-100 text-red-700 border-red-200",
    blue:   "bg-blue-100 text-blue-700 border-blue-200",
    amber:  "bg-amber-100 text-amber-700 border-amber-200",
    slate:  "bg-stone-100 text-stone-500 border-stone-200",
  };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${c[color]}`} style={{fontFamily:MONO}}>{children}</span>;
}

function StatCell({ label, value }) {
  return (
    <div className="flex flex-col items-center p-4 bg-white border-b-2 border-stone-200 shadow-none" style={{borderRadius:4}}>
      <span className="text-2xl font-black text-stone-900" style={{fontFamily:MONO}}>{value}</span>
      <span className="text-xs text-stone-400 mt-0.5 uppercase font-bold tracking-widest" style={{fontFamily:BODY, letterSpacing:"0.12em"}}>{label}</span>
    </div>
  );
}

function ImageDropZone({ onFile, label = "Drop a screenshot here" }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const handle = (file) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onFile({ preview: e.target.result, b64: e.target.result.split(",")[1], mediaType: file.type });
    reader.readAsDataURL(file);
  };
  return (
    <div onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onClick={() => ref.current.click()}
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${drag ? "border-emerald-400 bg-emerald-50" : "border-stone-300 hover:border-stone-400 hover:bg-stone-50"}`}>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => handle(e.target.files[0])} />
      <div className="text-5xl mb-3">📸</div>
      <p className="text-stone-700 font-semibold mb-1" style={{fontFamily:BODY}}>{label}</p>
      <p className="text-stone-400 text-sm">or click to browse</p>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl shadow-2xl my-4" style={{borderRadius:6}}>
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-stone-100 sticky top-0 bg-white z-10" style={{borderRadius:"6px 6px 0 0"}}>
          <h2 className="text-base font-black text-stone-900 uppercase tracking-wider" style={{fontFamily:BODY, letterSpacing:"0.08em"}}>{title}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-800 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function StepNav({ back, next, nextLabel = "Next →", nextDisabled = false, loading = false }) {
  return (
    <div className="flex gap-3 pt-2">
      {back && <button onClick={back} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors">← Back</button>}
      {next && <button onClick={next} disabled={nextDisabled || loading} className="flex-1 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors disabled:opacity-40">{loading ? "Working…" : nextLabel}</button>}
    </div>
  );
}

// ── Team Upload Modal ──────────────────────────────────────────────────────────
function TeamUploadModal({ onClose, onTeamsAdded, existingTeams }) {
  const [step, setStep] = useState("upload");
  const [img, setImg] = useState(null);
  const [edited, setEdited] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleExtract = async () => {
    setLoading(true); setError("");
    try {
      const result = await extractTeamsFromImage(img.b64, img.mediaType);
      const teams = (result.teams || []).map(t => ({ ...t, skip: existingTeams.some(e => e.name.toLowerCase() === t.name?.toLowerCase()) }));
      setEdited(teams);
      setStep("confirm");
    } catch { setError("Could not extract teams. Try a clearer screenshot."); }
    setLoading(false);
  };

  const handleConfirm = () => { onTeamsAdded(edited.filter(t => !t.skip && t.name?.trim())); setStep("done"); };
  const upd = (i, k, v) => setEdited(p => p.map((t, idx) => idx === i ? { ...t, [k]: v } : t));

  return (
    <ModalShell title={step === "done" ? "✓ Teams Added" : "Add Teams from Screenshot"} onClose={onClose}>
      {step === "upload" && (
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">Upload a screenshot of a team list, league directory, or any image showing team names.</p>
          <ImageDropZone onFile={(f) => { setImg(f); setStep("preview"); }} label="Drop a team list screenshot" />
          <div className="relative flex items-center gap-4">
            <div className="flex-1 border-t border-stone-200" />
            <span className="text-stone-400 text-xs">or</span>
            <div className="flex-1 border-t border-stone-200" />
          </div>
          <button onClick={() => setEdited([{ name: "", coach: "", division: "", skip: false }]) || setStep("confirm")}
            className="w-full py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors text-sm">
            ✏️ Enter teams manually
          </button>
        </div>
      )}
      {step === "preview" && (
        <div className="space-y-4">
          <img src={img.preview} alt="preview" className="w-full rounded-lg border border-stone-200 max-h-64 object-contain bg-white" />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <StepNav back={() => setStep("upload")} next={handleExtract} nextLabel="Extract Teams with AI ✨" loading={loading} />
        </div>
      )}
      {step === "confirm" && (
        <div className="space-y-4">
          <p className="text-stone-400 text-sm">{edited.length} team{edited.length !== 1 ? "s" : ""} found. Edit or uncheck to skip.</p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {edited.map((t, i) => (
              <div key={i} className={`flex items-center gap-2 p-3 rounded-lg border ${t.skip ? "border-stone-200/50 opacity-50" : "border-stone-200 bg-stone-50"}`}>
                <input type="checkbox" checked={!t.skip} onChange={e => upd(i, "skip", !e.target.checked)} className="accent-emerald-500 w-4 h-4 flex-shrink-0" />
                <input value={t.name || ""} onChange={e => upd(i, "name", e.target.value)} placeholder="Team name…"
                  className="flex-1 bg-stone-100 border border-stone-300 rounded-lg px-3 py-1.5 text-stone-900 text-sm min-w-0" />
                <input value={t.coach || ""} onChange={e => upd(i, "coach", e.target.value)} placeholder="Coach…"
                  className="w-32 bg-stone-100 border border-stone-300 rounded-lg px-3 py-1.5 text-stone-600 text-sm" />
                {t.skip && <span className="text-xs text-stone-400 whitespace-nowrap">exists</span>}
              </div>
            ))}
          </div>
          <button onClick={() => setEdited(p => [...p, { name: "", coach: "", division: "", skip: false }])}
            className="text-sm text-emerald-600 hover:text-emerald-700 transition-colors">+ Add row</button>
          <StepNav back={img ? () => setStep("preview") : () => setStep("upload")} next={handleConfirm}
            nextLabel={`Add ${edited.filter(t => !t.skip && t.name?.trim()).length} Teams ✓`} />
        </div>
      )}
      {step === "done" && (
        <div className="text-center py-8 space-y-4">
          <div className="text-6xl">🏟️</div>
          <p className="text-emerald-600 font-bold text-xl">Teams added!</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setStep("upload"); setImg(null); setEdited([]); setError(""); }} className="px-5 py-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">Upload Another</button>
            <button onClick={onClose} className="px-5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors">Done</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Schedule Entry Modal (manual) ─────────────────────────────────────────────
function blankGame() {
  return { opponent: "", date: "", time: "", location: "", isHome: true };
}

function ScheduleModal({ teams, presetTeam, onClose, onScheduleAdded }) {
  const [selectedTeam, setSelectedTeam] = useState(presetTeam || teams[0]?.name || "");
  const [games, setGames] = useState([blankGame()]);
  const [saved, setSaved] = useState(false);

  const upd = (i, k, v) => setGames(p => p.map((g, idx) => idx === i ? { ...g, [k]: v } : g));
  const addRow = () => setGames(p => [...p, blankGame()]);
  const removeRow = (i) => setGames(p => p.filter((_, idx) => idx !== i));

  const validGames = games.filter(g => g.opponent.trim());

  const handleSave = () => {
    onScheduleAdded(selectedTeam, validGames);
    setSaved(true);
  };

  const handleAddMore = () => {
    setGames([blankGame()]);
    setSaved(false);
  };

  if (saved) {
    return (
      <ModalShell title="✓ Schedule Saved" onClose={onClose}>
        <div className="text-center py-8 space-y-4">
          <div className="text-6xl">📅</div>
          <p className="text-emerald-600 font-bold text-xl">{validGames.length} game{validGames.length !== 1 ? "s" : ""} added for {selectedTeam}!</p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleAddMore} className="px-5 py-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">Add More Games</button>
            <button onClick={onClose} className="px-5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors">Done</button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Enter Schedule" onClose={onClose}>
      <div className="space-y-5">
        {/* Team selector */}
        <div className="flex items-center gap-3">
          <label className="text-stone-600 text-sm whitespace-nowrap font-semibold">Team:</label>
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
            className="flex-1 bg-white border border-stone-300 rounded-lg px-3 py-2 text-stone-900 text-sm">
            {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>

        {/* Column headers */}
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 110px 80px 1fr 28px" }}>
          <span className="text-xs text-stone-400 uppercase tracking-wider px-1">Opponent</span>
          <span className="text-xs text-stone-400 uppercase tracking-wider px-1">Date</span>
          <span className="text-xs text-stone-400 uppercase tracking-wider px-1">Time</span>
          <span className="text-xs text-stone-400 uppercase tracking-wider px-1">Location</span>
          <span />
        </div>

        {/* Game rows */}
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {games.map((g, i) => (
            <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 110px 80px 1fr 28px" }}>
              {/* Opponent + H/A toggle */}
              <div className="flex gap-1 min-w-0">
                <select value={g.isHome ? "home" : "away"} onChange={e => upd(i, "isHome", e.target.value === "home")}
                  className="bg-stone-100 border border-stone-300 rounded-lg px-2 py-2 text-xs text-stone-600 flex-shrink-0">
                  <option value="home">vs</option>
                  <option value="away">@</option>
                </select>
                <input value={g.opponent} onChange={e => upd(i, "opponent", e.target.value)}
                  placeholder="Opponent…"
                  className="flex-1 min-w-0 bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-stone-900 text-sm" />
              </div>

              {/* Date */}
              <input type="date" value={g.date} onChange={e => upd(i, "date", e.target.value)}
                className="w-full bg-stone-100 border border-stone-300 rounded-lg px-2 py-2 text-stone-600 text-sm" />

              {/* Time */}
              <input value={g.time} onChange={e => upd(i, "time", e.target.value)}
                placeholder="4:00 PM"
                className="w-full bg-stone-100 border border-stone-300 rounded-lg px-2 py-2 text-stone-600 text-sm" />

              {/* Location */}
              <input value={g.location} onChange={e => upd(i, "location", e.target.value)}
                placeholder="Field / park…"
                className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-stone-600 text-sm" />

              {/* Remove */}
              <button onClick={() => removeRow(i)}
                className="text-stone-500 hover:text-red-600 transition-colors text-lg leading-none flex-shrink-0 text-center">
                ×
              </button>
            </div>
          ))}
        </div>

        <button onClick={addRow}
          className="text-sm text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1">
          + Add game
        </button>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={validGames.length === 0}
            className="flex-1 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors disabled:opacity-40">
            Save {validGames.length > 0 ? `${validGames.length} Game${validGames.length !== 1 ? "s" : ""}` : "Games"} ✓
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Game Stats Upload Modal (per-team, player-level) ──────────────────────────
function StatsUploadModal({ teams, onClose, onGameAdded, presetTeam, presetGameIdx }) {
  const todayStr = today();

  // Step 1 state – pick team + game
  const [teamName, setTeamName] = useState(presetTeam || teams[0]?.name || "");
  const [selectedGameIdx, setSelectedGameIdx] = useState(presetGameIdx ?? null); // index into team's schedule
  const [myScore, setMyScore] = useState("");
  const [oppScore, setOppScore] = useState("");

  // Step 2 state – upload screenshots
  const [hitImg, setHitImg]     = useState(null);
  const [hitData, setHitData]   = useState(null);
  const [hitLoading, setHitLoading] = useState(false);
  const [hitError, setHitError] = useState("");
  const [pitImg, setPitImg]     = useState(null);
  const [pitData, setPitData]   = useState(null);
  const [pitLoading, setPitLoading] = useState(false);
  const [pitError, setPitError] = useState("");

  const [step, setStep] = useState(presetGameIdx != null ? "upload" : "pick"); // pick | upload | done

  const selectedTeam = teams.find(t => t.name === teamName);

  // Games that haven't been completed yet, sorted by date
  const openGames = (selectedTeam?.schedule || [])
    .map((g, i) => ({ ...g, _idx: i }))
    .filter(g => !g.result)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  const pickedGame = selectedGameIdx !== null ? selectedTeam?.schedule[selectedGameIdx] : null;

  // When team changes, reset game selection
  const handleTeamChange = (name) => {
    setTeamName(name);
    setSelectedGameIdx(null);
    setMyScore(""); setOppScore("");
  };

  const handlePickGame = (idx) => {
    setSelectedGameIdx(idx);
    setMyScore(""); setOppScore("");
  };

  const extractHitting = async () => {
    setHitLoading(true); setHitError("");
    try {
      const r = await extractPlayerStatsFromImage(hitImg.b64, hitImg.mediaType);
      if (!r.hitters || r.hitters.length === 0) {
        setHitError("No players found. Make sure the image shows a batting lineup with AB, H, R columns.");
      }
      setHitData(r.hitters || []);
    } catch(e) {
      console.error("Hitting extraction error:", e);
      setHitError("Extraction failed: " + e.message + ". Try a clearer image.");
    }
    setHitLoading(false);
  };

  const extractPitching = async () => {
    setPitLoading(true); setPitError("");
    try {
      const r = await extractPlayerStatsFromImage(pitImg.b64, pitImg.mediaType);
      if (!r.pitchers || r.pitchers.length === 0) {
        setHitError("No pitchers found. Make sure the image shows a pitching line with IP, H, R, ER columns.");
      }
      setPitData(r.pitchers || []);
    } catch(e) {
      console.error("Pitching extraction error:", e);
      setPitError("Extraction failed: " + e.message + ". Try a clearer image.");
    }
    setPitLoading(false);
  };

  const handleSave = () => {
    onGameAdded({
      teamName,
      scheduleIdx: selectedGameIdx,
      opponent: pickedGame?.opponent || "Unknown",
      myScore: toInt(myScore),
      oppScore: toInt(oppScore),
      date: pickedGame?.date || todayStr,
      hitters: hitData || [],
      pitchers: pitData || [],
    });
    setStep("done");
  };

  const reset = () => {
    setStep("pick");
    setSelectedGameIdx(null); setMyScore(""); setOppScore("");
    setHitImg(null); setHitData(null); setPitImg(null); setPitData(null);
    setHitError(""); setPitError("");
  };

  const canSave = pickedGame && (hitData || pitData);

  // ── Done screen ──
  if (step === "done") return (
    <ModalShell title="✓ Game Saved" onClose={onClose}>
      <div className="text-center py-8 space-y-4">
        <div className="text-6xl">⚾</div>
        <p className="text-emerald-600 font-bold text-xl">Stats saved!</p>
        <p className="text-stone-400 text-sm">{teamName} vs {pickedGame?.opponent}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="px-5 py-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">Add Another Game</button>
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors">Done</button>
        </div>
      </div>
    </ModalShell>
  );

  // ── Step 1: Pick game ──
  if (step === "pick") return (
    <ModalShell title="Upload Game Stats" onClose={onClose}>
      <div className="space-y-4">

        {/* Team selector */}
        <div>
          <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1.5">Team</label>
          <select value={teamName} onChange={e => handleTeamChange(e.target.value)}
            className="w-full bg-stone-100 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 text-sm">
            {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>

        {/* Game picker */}
        <div>
          <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1.5">Select Game</label>
          {openGames.length === 0 ? (
            <div className="text-center py-6 text-stone-400 bg-stone-50 rounded-xl border border-stone-200">
              <p className="text-sm">No upcoming games on schedule</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {openGames.map((g) => {
                const isSelected = selectedGameIdx === g._idx;
                return (
                  <button key={g._idx} onClick={() => handlePickGame(g._idx)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-sky-500 bg-sky-50 text-stone-900"
                        : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-400 hover:bg-white"
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">
                          <span className="text-stone-400 mr-1">{g.isHome ? "vs" : "@"}</span>
                          {g.opponent}
                        </p>
                        <p className="text-xs text-stone-500 font-medium mt-0.5">
                          {fmtDate(g.date)}{g.time ? ` · ${g.time}` : ""}{g.location ? ` · ${g.location}` : ""}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {isSelected
                          ? <span className="text-emerald-600 text-lg">✓</span>
                          : <span className="text-stone-500 text-sm">{g.type === "Conference" ? "CONF" : g.type || ""}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Score entry – only shown once a game is picked */}
        {pickedGame && (
          <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 space-y-2">
            <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block">Final Score</label>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-center">
                <p className="text-xs text-stone-400 mb-1">{teamName}</p>
                <input value={myScore} onChange={e => setMyScore(e.target.value)}
                  placeholder="0" type="number" min="0"
                  className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-stone-900 text-xl font-bold text-center" />
              </div>
              <span className="text-stone-400 text-2xl font-bold pb-1">–</span>
              <div className="flex-1 text-center">
                <p className="text-xs text-stone-400 mb-1">{pickedGame.opponent}</p>
                <input value={oppScore} onChange={e => setOppScore(e.target.value)}
                  placeholder="0" type="number" min="0"
                  className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2.5 text-stone-900 text-xl font-bold text-center" />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={() => setStep("upload")} disabled={!pickedGame}
            className="flex-1 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors disabled:opacity-40">
            Upload Stats →
          </button>
        </div>
      </div>
    </ModalShell>
  );

  // ── Step 2: Upload screenshots ──
  return (
    <ModalShell title={`Stats — ${pickedGame?.opponent}`} onClose={onClose}>
      <div className="space-y-4">

        {/* Game summary header */}
        <div className="bg-stone-50 rounded-xl border border-stone-200 px-4 py-3 space-y-2">
          <div className="flex items-center gap-4">
            <TeamBadge name={teamName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-900">{teamName} <span className="text-stone-400">{pickedGame?.isHome ? "vs" : "@"}</span> {pickedGame?.opponent}</p>
              <p className="text-xs text-stone-600 font-medium">{fmtDate(pickedGame?.date)}{pickedGame?.time ? ` · ${pickedGame.time}` : ""}</p>
            </div>
            <button onClick={() => setStep("pick")} className="text-xs text-stone-400 hover:text-stone-900 transition-colors">← Change</button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider">Final Score:</span>
            <input value={myScore} onChange={e => setMyScore(e.target.value)} placeholder="0" type="number" min="0"
              className="w-14 bg-white border border-stone-300 rounded px-2 py-1 text-stone-900 text-sm font-bold text-center" />
            <span className="text-stone-400 font-bold">–</span>
            <input value={oppScore} onChange={e => setOppScore(e.target.value)} placeholder="0" type="number" min="0"
              className="w-14 bg-white border border-stone-300 rounded px-2 py-1 text-stone-900 text-sm font-bold text-center" />
            <span className="text-xs text-stone-500">{pickedGame?.opponent}</span>
            {myScore !== "" && oppScore !== "" && (
              <span className={`ml-2 font-bold font-mono text-sm ${toInt(myScore) > toInt(oppScore) ? "text-emerald-600" : toInt(myScore) < toInt(oppScore) ? "text-red-600" : "text-stone-400"}`}>
                {toInt(myScore) > toInt(oppScore) ? "W" : toInt(myScore) < toInt(oppScore) ? "L" : "T"}
              </span>
            )}
          </div>
        </div>

        {/* Hitting upload */}
        <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-emerald-600 uppercase tracking-wider font-semibold">🏏 Hitting Stats</p>
            {hitData && <span className="text-xs text-emerald-600">{hitData.length} players ✓</span>}
          </div>
          {!hitImg ? (
            <ImageDropZone onFile={f => { setHitImg(f); setHitData(null); }} label="Drop hitting stats screenshot" />
          ) : (
            <div className="space-y-2">
              <img src={hitImg.preview} alt="hitting" className="w-full rounded-lg border border-stone-200 max-h-40 object-contain bg-stone-100" />
              {hitData ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-stone-400 border-b border-stone-200">
                      <th className="text-left py-1 pr-3">Player</th>
                      <th className="px-1 text-center">AB</th><th className="px-1 text-center">H</th><th className="px-1 text-center">R</th>
                      <th className="px-1 text-center">RBI</th><th className="px-1 text-center">HR</th><th className="px-1 text-center">BB</th><th className="px-1 text-center">K</th>
                    </tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {hitData.map((p,i) => (
                        <tr key={i} className="text-stone-600">
                          <td className="py-1 pr-3 font-semibold text-stone-900 whitespace-nowrap">{p.name} <span className="text-stone-400 font-normal">{p.pos}</span></td>
                          <td className="px-1 text-center font-mono">{p.ab}</td><td className="px-1 text-center font-mono">{p.h}</td>
                          <td className="px-1 text-center font-mono">{p.r}</td><td className="px-1 text-center font-mono">{p.rbi}</td>
                          <td className="px-1 text-center font-mono">{p.hr}</td><td className="px-1 text-center font-mono">{p.bb}</td>
                          <td className="px-1 text-center font-mono">{p.so}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setHitImg(null)} className="text-xs text-stone-400 hover:text-stone-900 px-2">✕</button>
                  <button onClick={extractHitting} disabled={hitLoading}
                    className="flex-1 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 text-sm font-semibold disabled:opacity-40">
                    {hitLoading ? "Extracting…" : "Extract with AI ✨"}
                  </button>
                </div>
              )}
              {hitError && <p className="text-red-600 text-xs">{hitError}</p>}
              {hitData && <button onClick={() => { setHitImg(null); setHitData(null); }} className="text-xs text-stone-400 hover:text-stone-900">↺ Re-upload</button>}
            </div>
          )}
        </div>

        {/* Pitching upload */}
        <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-indigo-600 uppercase tracking-wider font-semibold">⚡ Pitching Stats</p>
            {pitData && <span className="text-xs text-indigo-600">{pitData.length} pitchers ✓</span>}
          </div>
          {!pitImg ? (
            <ImageDropZone onFile={f => { setPitImg(f); setPitData(null); }} label="Drop pitching stats screenshot" />
          ) : (
            <div className="space-y-2">
              <img src={pitImg.preview} alt="pitching" className="w-full rounded-lg border border-stone-200 max-h-40 object-contain bg-stone-100" />
              {pitData ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-stone-400 border-b border-stone-200">
                      <th className="text-left py-1 pr-3">Pitcher</th>
                      <th className="px-1 text-center">IP</th><th className="px-1 text-center">H</th><th className="px-1 text-center">R</th>
                      <th className="px-1 text-center">ER</th><th className="px-1 text-center">BB</th><th className="px-1 text-center">K</th><th className="px-1 text-center">Dec</th>
                    </tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {pitData.map((p,i) => (
                        <tr key={i} className="text-stone-600">
                          <td className="py-1 pr-3 font-semibold text-stone-900 whitespace-nowrap">{p.name}</td>
                          <td className="px-1 text-center font-mono">{p.ip}</td><td className="px-1 text-center font-mono">{p.h}</td>
                          <td className="px-1 text-center font-mono">{p.r}</td><td className="px-1 text-center font-mono">{p.er}</td>
                          <td className="px-1 text-center font-mono">{p.bb}</td><td className="px-1 text-center font-mono">{p.so}</td>
                          <td className="px-1 text-center font-mono font-bold text-emerald-600">{p.dec}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setPitImg(null)} className="text-xs text-stone-400 hover:text-stone-900 px-2">✕</button>
                  <button onClick={extractPitching} disabled={pitLoading}
                    className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-stone-900 text-sm font-semibold disabled:opacity-40">
                    {pitLoading ? "Extracting…" : "Extract with AI ✨"}
                  </button>
                </div>
              )}
              {pitError && <p className="text-red-600 text-xs">{pitError}</p>}
              {pitData && <button onClick={() => { setPitImg(null); setPitData(null); }} className="text-xs text-stone-400 hover:text-stone-900">↺ Re-upload</button>}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={() => setStep("pick")} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">← Back</button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex-1 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors disabled:opacity-40">
            Save Game ✓
          </button>
        </div>
      </div>
    </ModalShell>
  );
}


// ── Player Stats helpers ──────────────────────────────────────────────────────
function sumHitters(players) {
  return players.reduce((acc, p) => {
    ["ab","h","r","rbi","hr","bb","so","2b","3b","sb"].forEach(k => { acc[k] = (acc[k]||0) + toNum(p[k]||0); });
    return acc;
  }, {});
}
function sumPitchers(players) {
  return players.reduce((acc, p) => {
    ["h","r","er","bb","so","hr"].forEach(k => { acc[k] = (acc[k]||0) + toNum(p[k]||0); }); acc.ip = outsToIp(ipToOuts(acc.ip||0) + ipToOuts(p.ip||0));
    return acc;
  }, {});
}
function isConferenceGame(game, team) {
  if (game.type === "Conference") return true;
  if (game.type && game.type !== "") return false;
  // Fall back to matching against schedule by date + opponent
  const match = (team.schedule || []).find(s =>
    s.date === game.date && s.opponent === game.opponent
  );
  return match?.type === "Conference";
}

function mergePlayerStats(games, type, leagueOnly = false, team = null) {
  // type = "hitters" or "pitchers"
  const map = {};
  games.filter(g => g.type !== 'rainout' && (!leagueOnly || isConferenceGame(g, team || {}))).forEach(g => {
    (g[type] || []).forEach(p => {
      const key = p.name?.toLowerCase().trim();
      if (!key) return;
      if (!map[key]) map[key] = { name: p.name, pos: p.pos || "", stats: {} };
      const fields = type === "hitters"
        ? ["ab","h","r","rbi","hr","bb","so","2b","3b","sb"]
        : ["ip","h","r","er","bb","so","hr"];
      fields.forEach(k => { map[key].stats[k] = (map[key].stats[k]||0) + toNum(p[k]||0); });
      if (p.dec) map[key].dec = (map[key].dec || "") + (p.dec ? p.dec : "");
    });
  });
  return Object.values(map).sort((a,b) => (b.stats.ab||b.stats.ip||0) - (a.stats.ab||a.stats.ip||0));
}

// ── Team Page ──────────────────────────────────────────────────────────────────
function TeamPage({ team, teams, onBack, onUploadSchedule, onAddGame, onDeleteGame, onMarkRainout, onDeleteSchedule, onRainoutSchedule, onAddGameFromSchedule, onTeamClick, onUpdateRoster }) {
  const [tab, setTab] = useState("schedule");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showGrades, setShowGrades] = useState(false);
  const [showGamePicker, setShowGamePicker] = useState(false);
  const [selectedGameIdxs, setSelectedGameIdxs] = useState(null); // null = all games
  const [sortH, setSortH] = useState({ col:"avg", dir:"desc" });
  const [sortP, setSortP] = useState({ col:"era", dir:"asc" });
  const todayStr = today();
  const upcoming = [...team.schedule].filter(g => !g.result && (g.date >= todayStr || !g.date)).sort((a,b)=>(a.date||"9").localeCompare(b.date||"9"));
  const pastSched = [...team.schedule].filter(g => g.result || (g.date && g.date < todayStr)).sort((a,b)=>(b.date||"0").localeCompare(a.date||"0"));

  // playedGames sorted newest-first (for the picker display)
  const playedGames = team.games
    .map((g, i) => ({ ...g, _origIdx: i }))
    .filter(g => g.type !== "rainout")
    .sort((a,b) => (b.date||"0").localeCompare(a.date||"0"));

  const filteredGames = selectedGameIdxs === null
    ? playedGames
    : playedGames.filter(g => selectedGameIdxs.has(g._origIdx));

  const isFiltered = selectedGameIdxs !== null;

  const allHitters = mergePlayerStats(filteredGames, "hitters");
  const allPitchers = mergePlayerStats(filteredGames, "pitchers");

  const hitSortFns = {
    avg: p => parseFloat(avg(p.stats.h||0,p.stats.ab||0)), ab: p=>p.stats.ab||0,
    h:p=>p.stats.h||0, r:p=>p.stats.r||0, rbi:p=>p.stats.rbi||0, hr:p=>p.stats.hr||0,
    bb:p=>p.stats.bb||0, so:p=>p.stats.so||0, sb:p=>p.stats.sb||0,
    obp: p=>parseFloat(avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0))),
  };
  const pitSortFns = {
    era: p=>parseFloat(era(p.stats.er||0,p.stats.ip||0)),
    whip: p=>parseFloat(whip(p.stats.bb||0,p.stats.h||0,p.stats.ip||0)),
    ip:p=>p.stats.ip||0, so:p=>p.stats.so||0, bb:p=>p.stats.bb||0,
    h:p=>p.stats.h||0, er:p=>p.stats.er||0, hr:p=>p.stats.hr||0,
  };

  const seasonHitters = [...allHitters].sort((a,b) => {
    const fn = hitSortFns[sortH.col]||hitSortFns.avg;
    return sortH.dir==="asc" ? fn(a)-fn(b) : fn(b)-fn(a);
  });
  const seasonPitchers = [...allPitchers].sort((a,b) => {
    const fn = pitSortFns[sortP.col]||pitSortFns.era;
    return sortP.dir==="asc" ? fn(a)-fn(b) : fn(b)-fn(a);
  });
  const totH = sumHitters(allHitters.map(p => p.stats));
  const totP = sumPitchers(allPitchers.map(p => p.stats));

  const ThH = ({label,col}) => <SortTh label={label} col={col} sort={sortH} setSort={setSortH}/>;
  const ThP = ({label,col}) => <SortTh label={label} col={col} sort={sortP} setSort={setSortP}/>;

  const meta = TEAM_META[team.name];
  const headerBg = meta ? `linear-gradient(135deg, ${meta.bg}ee 0%, ${meta.bg}bb 100%)` : "linear-gradient(135deg,#0c2340,#1a3a5c)";

  return (
    <>
    <div className="min-h-screen text-stone-800" style={{ fontFamily:BODY, backgroundColor:"var(--page-bg, #f2f2f0)" }}>
      <FontLink />

      {/* Sticky nav bar */}
      <div style={{background:"#0a1628", position:"sticky", top:0, zIndex:50}}>
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-4" style={{height:48}}>
          <button onClick={onBack} className="text-white/60 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5" style={{fontFamily:BODY, letterSpacing:"0.1em"}}>
            ‹ League
          </button>
          <div style={{width:1, height:20, background:"rgba(255,255,255,0.15)"}} />
          <TeamBadge name={team.name} size="sm" />
          <h1 className="text-white font-black flex-1 text-sm uppercase tracking-wider" style={{fontFamily:BODY, letterSpacing:"0.08em"}}>{team.name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-emerald-400" style={{fontFamily:MONO}}>{team.wins}W</span>
            <span className="text-white/30 text-xs">–</span>
            <span className="text-xs font-black text-red-400" style={{fontFamily:MONO}}>{team.losses}L</span>
          </div>
          <button onClick={onAddGame}
            className="text-xs font-black px-4 py-1.5 transition-all uppercase tracking-wider"
            style={{background:"#e53e3e", color:"white", borderRadius:3, letterSpacing:"0.08em", fontFamily:BODY}}>
            + Game
          </button>
          <button onClick={onUploadSchedule}
            className="text-xs font-bold px-3 py-1.5 transition-colors uppercase tracking-wider"
            style={{background:"rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)", borderRadius:3, border:"1px solid rgba(255,255,255,0.15)", letterSpacing:"0.08em", fontFamily:BODY}}>
            Schedule
          </button>
        </div>
      </div>

      {/* Team color accent strip */}
      <div style={{background:headerBg, height:4}} />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCell label="AVG" value={avg(totH.h||0, totH.ab||0)} />
          <StatCell label="Games" value={team.games.filter(g=>g.type!=='rainout').length} />
          <StatCell label="ERA" value={era(totP.er||0, totP.ip||0)} />
          <StatCell label="WHIP" value={whip(totP.bb||0, totP.h||0, totP.ip||0)} />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stone-200">
          {["schedule","hitting","pitching","game log"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-3 text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap"
              style={{
                color: tab===t ? "var(--tab-active, #0a1628)" : "#9ca3af",
                borderBottom: tab===t ? "3px solid #e53e3e" : "3px solid transparent",
                letterSpacing: "0.1em",
                fontFamily: BODY,
                marginBottom: -1,
              }}>{t}</button>
          ))}
        </div>

        {/* SCHEDULE */}
        {tab === "schedule" && (() => {
          const allGames = [...team.schedule]
            .map((g, idx) => ({ ...g, schedIdx: idx }))
            .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

          // Group by date
          const grouped = allGames.reduce((acc, g) => {
            const key = g.date || "TBD";
            if (!acc[key]) acc[key] = [];
            acc[key].push(g);
            return acc;
          }, {});
          const dateKeys = Object.keys(grouped).sort();

          // Mini standings
          const standingsList = [...(teams||[])].sort((a,b) => {
            const pa = a.wins+a.losses===0?0:a.wins/(a.wins+a.losses);
            const pb = b.wins+b.losses===0?0:b.wins/(b.wins+b.losses);
            return pb-pa;
          });

          const fmtDayHeader = (d) => {
            if (!d || d === "TBD") return "Date TBD";
            const [y, m, day] = d.split("-").map(Number);
            const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
            const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            // Use UTC to avoid any timezone shifting
            const dow = DAYS[new Date(Date.UTC(y, m-1, day)).getUTCDay()];
            return `${dow}, ${MONTHS[m-1]} ${day}, ${y}`;
          };

          return (
          <div style={{display:"flex", gap:16, alignItems:"flex-start"}}>
            {/* LEFT: Schedule */}
            <div style={{flex:"0 0 65%", minWidth:0}}>
              {allGames.length === 0 ? (
                <div className="bg-white border border-stone-200 text-center py-10 text-stone-400 space-y-2">
                  <p>No games scheduled yet</p>
                  <button onClick={onUploadSchedule} className="text-sky-600 hover:text-sky-800 text-sm">Enter Schedule →</button>
                </div>
              ) : dateKeys.map(dateKey => (
                <div key={dateKey} className="mb-4">
                  {/* Date header — ESPN style */}
                  <div className="px-4 py-2 border-b-2 border-stone-800" style={{background:"var(--card-bg, #fff)"}}>
                    <p className="text-xs font-black uppercase text-stone-800" style={{fontFamily:BODY, letterSpacing:"0.1em"}}>{fmtDayHeader(dateKey)}</p>
                  </div>
                  {/* Column headers */}
                  <div className="bg-stone-50 border-b border-stone-100 px-4 py-1 grid text-xs font-black uppercase text-stone-400" style={{gridTemplateColumns:"1fr 60px 60px 70px", letterSpacing:"0.08em", fontFamily:BODY}}>
                    <span>Matchup</span>
                    <span className="text-center">Time</span>
                    <span className="text-center">Result</span>
                    <span className="text-right">Actions</span>
                  </div>
                  {/* Game rows */}
                  <div className="bg-white border border-stone-100 divide-y divide-stone-50">
                    {grouped[dateKey].map((g, i) => {
                      const isPast = g.date && g.date < todayStr;
                      const hasResult = !!g.result;
                      const isRainout = g.type === "rainout";
                      const needsStats = isPast && !hasResult && !isRainout;
                      return (
                        <div key={i} className={`px-4 py-3 grid items-center gap-2 ${needsStats ? "bg-amber-50/30" : ""}`}
                          style={{gridTemplateColumns:"1fr 60px 60px 70px"}}>
                          {/* Matchup */}
                          <div className="flex items-center gap-2 min-w-0">
                            <TeamBadge name={g.opponent} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-stone-800 truncate">
                                <span className="text-stone-400 font-normal mr-1">{g.isHome ? "vs" : "@"}</span>
                                {g.opponent}
                              </p>
                              {g.location && <p className="text-xs text-stone-400 truncate">{g.location}</p>}
                            </div>
                          </div>
                          {/* Time */}
                          <div className="text-center">
                            <p className="text-xs font-semibold text-stone-500" style={{fontFamily:MONO}}>{g.time || "—"}</p>
                          </div>
                          {/* Result / Status */}
                          <div className="text-center">
                            {isRainout
                              ? <span className="text-xs font-bold text-blue-400">🌧</span>
                              : hasResult
                                ? <span className={`text-sm font-black ${g.result==="W"?"text-emerald-600":g.result==="L"?"text-red-600":"text-stone-500"}`} style={{fontFamily:MONO}}>{g.result} {g.score}-{g.oppScore}</span>
                                : isPast
                                  ? <button onClick={() => onAddGameFromSchedule(g.schedIdx)} className="text-xs font-black px-2 py-0.5" style={{background:"#e53e3e",color:"white",borderRadius:3}}>+ Stats</button>
                                  : <span className="text-xs text-stone-300 font-semibold">{g.isHome ? "HOME" : "AWAY"}</span>
                            }
                          </div>
                          {/* Actions */}
                          <div className="flex gap-1 justify-end">
                            {hasResult && !isRainout && (
                              <button onClick={() => onAddGameFromSchedule(g.schedIdx)}
                                title="Re-upload stats" className="text-xs px-1.5 py-1 rounded border border-stone-200 text-stone-400 hover:bg-stone-100 transition-colors">✏️</button>
                            )}
                            {!isRainout && (
                              <button onClick={() => onRainoutSchedule(g.schedIdx)}
                                title="Rainout" className="text-xs px-1.5 py-1 rounded border border-blue-200 text-blue-400 hover:bg-blue-50 transition-colors">🌧</button>
                            )}
                            {confirmDelete === g.schedIdx ? (
                              <>
                                <button onClick={() => { onDeleteSchedule(g.schedIdx); setConfirmDelete(null); }}
                                  className="text-xs px-2 py-1 rounded bg-red-500 text-white font-bold">✓</button>
                                <button onClick={() => setConfirmDelete(null)}
                                  className="text-xs px-2 py-1 rounded border border-stone-200 text-stone-400">✕</button>
                              </>
                            ) : (
                              <button onClick={() => setConfirmDelete(g.schedIdx)}
                                title="Delete" className="text-xs px-1.5 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50 transition-colors">🗑</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* RIGHT: Mini Standings */}
            <div style={{flex:"0 0 calc(35% - 16px)", minWidth:0, position:"sticky", top:100}}>
              <div className="bg-white border border-stone-200 overflow-hidden">
                <div className="px-4 py-2 border-b-2 border-stone-800">
                  <p className="text-xs font-black uppercase text-stone-800" style={{fontFamily:BODY, letterSpacing:"0.1em"}}>Standings</p>
                </div>
                <div className="bg-stone-50 border-b border-stone-100 px-3 py-1 grid text-xs font-black uppercase text-stone-400" style={{gridTemplateColumns:"20px 1fr 28px 28px 40px", gap:4, letterSpacing:"0.06em", fontFamily:BODY}}>
                  <span>#</span><span>Team</span><span className="text-center">W</span><span className="text-center">L</span><span className="text-right">PCT</span>
                </div>
                {standingsList.map((t, i) => {
                  const pct = t.wins+t.losses===0?"—":(t.wins/(t.wins+t.losses)).toFixed(3).replace(/^0/,"");
                  const isThis = t.name === team.name;
                  return (
                    <div key={t.name}
                      className={`px-3 py-2 grid items-center border-b border-stone-50 cursor-pointer transition-colors ${isThis ? "bg-sky-50" : "hover:bg-stone-50"}`}
                      style={{gridTemplateColumns:"20px 1fr 28px 28px 40px", gap:4}}
                      onClick={() => onTeamClick && onTeamClick(t.name)}>
                      <span className="text-xs text-stone-400 font-bold" style={{fontFamily:MONO}}>{i+1}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <TeamBadge name={t.name} size="sm" />
                        <span className={`text-xs font-bold truncate ${isThis ? "text-sky-700" : "text-stone-700"}`} style={{fontFamily:BODY}}>{t.name.replace(" (Seattle)","").replace("Bishop ","")}</span>
                      </div>
                      <span className="text-xs text-center font-bold text-emerald-600" style={{fontFamily:MONO}}>{t.wins}</span>
                      <span className="text-xs text-center font-bold text-red-500" style={{fontFamily:MONO}}>{t.losses}</span>
                      <span className="text-xs text-right text-stone-500" style={{fontFamily:MONO}}>{pct}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );})()}

        {/* HITTING */}
        {tab === "hitting" && (
          <div className="bg-white border border-stone-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-bold text-lg text-stone-900" style={{fontFamily:DISPLAY}}>Season Hitting</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowGamePicker(true)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${isFiltered ? "bg-sky-600 text-white border-sky-600" : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                  <span>🎮</span>
                  {isFiltered ? `${filteredGames.length} of ${playedGames.length} games` : "Filter Games"}
                </button>
                {isFiltered && (
                  <button onClick={() => setSelectedGameIdxs(null)} className="text-xs text-stone-400 hover:text-red-500 transition-colors" title="Clear filter">✕</button>
                )}
                <button onClick={() => setShowGrades(true)} className="text-xs text-stone-400 hover:text-stone-600 transition-colors border border-stone-200 rounded px-2 py-1">Grades</button>
                <span className="text-stone-400 text-sm">{seasonHitters.length} players</span>
              </div>
            </div>
            {seasonHitters.length === 0 ? (
              <div className="text-center py-12 text-stone-400 space-y-2">
                <p>No hitting stats yet</p>
                <button onClick={onAddGame} className="text-sky-600 hover:text-sky-800 text-sm">Upload game stats →</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                      <th className="text-left px-4 py-3 sticky left-0 bg-stone-50" style={{fontFamily:BODY}}>Player</th>
                      <ThH label="AB" col="ab"/><ThH label="H" col="h"/>
                      <ThH label="AVG" col="avg"/><ThH label="R" col="r"/>
                      <ThH label="RBI" col="rbi"/><ThH label="HR" col="hr"/>
                      <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">2B</th>
                      <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">3B</th>
                      <ThH label="BB" col="bb"/><ThH label="K" col="so"/>
                      <ThH label="SB" col="sb"/><ThH label="OBP" col="obp"/>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {seasonHitters.map((p, i) => {
                      const s = p.stats;
                      return (
                        <tr key={i} className="hover:bg-sky-50/40 transition-colors">
                          <td className="px-4 py-3 sticky left-0 bg-white hover:bg-sky-50/40">
                            <span className="font-semibold text-stone-800" style={{fontFamily:DISPLAY, fontSize:"0.85rem"}}>{p.name}</span>
                            {p.pos && <span className="text-stone-400 text-xs ml-1.5">{p.pos}</span>}
                            {(team.roster||{})[p.name] && <span className="text-stone-400 text-xs ml-1.5">{(team.roster||{})[p.name]}</span>}
                          </td>
                          {[s.ab||0, s.h||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{v}</td>)}
                          <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{avg(s.h||0,s.ab||0)}</td>
                          {[s.r||0,s.rbi||0,s.hr||0,s["2b"]||0,s["3b"]||0,s.bb||0,s.so||0,s.sb||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{v}</td>)}
                          <td className="px-3 py-3 text-center font-semibold text-sky-700" style={{fontFamily:MONO}}>{avg((s.h||0)+(s.bb||0),(s.ab||0)+(s.bb||0))}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-stone-300 bg-stone-50 font-bold">
                      <td className="px-4 py-3 sticky left-0 bg-stone-50 text-xs uppercase tracking-wider text-stone-500">Totals</td>
                      {[totH.ab||0, totH.h||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{v}</td>)}
                      <td className="px-3 py-3 text-center text-emerald-700" style={{fontFamily:MONO}}>{avg(totH.h||0,totH.ab||0)}</td>
                      {[totH.r||0,totH.rbi||0,totH.hr||0,totH["2b"]||0,totH["3b"]||0,totH.bb||0,totH.so||0,totH.sb||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{v}</td>)}
                      <td className="px-3 py-3 text-center text-sky-700" style={{fontFamily:MONO}}>{avg((totH.h||0)+(totH.bb||0),(totH.ab||0)+(totH.bb||0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PITCHING */}
        {tab === "pitching" && (
          <div className="bg-white border border-stone-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-bold text-lg text-stone-900" style={{fontFamily:DISPLAY}}>Season Pitching</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowGamePicker(true)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${isFiltered ? "bg-sky-600 text-white border-sky-600" : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                  <span>🎮</span>
                  {isFiltered ? `${filteredGames.length} of ${playedGames.length} games` : "Filter Games"}
                </button>
                {isFiltered && (
                  <button onClick={() => setSelectedGameIdxs(null)} className="text-xs text-stone-400 hover:text-red-500 transition-colors" title="Clear filter">✕</button>
                )}
                <span className="text-stone-400 text-sm">{seasonPitchers.length} pitchers</span>
              </div>
            </div>
            {seasonPitchers.length === 0 ? (
              <div className="text-center py-12 text-stone-400 space-y-2">
                <p>No pitching stats yet</p>
                <button onClick={onAddGame} className="text-sky-600 hover:text-sky-800 text-sm">Upload game stats →</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                      <th className="text-left px-4 py-3 sticky left-0 bg-stone-50" style={{fontFamily:BODY}}>Pitcher</th>
                      <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">GP</th>
                      <ThP label="IP" col="ip"/><ThP label="ERA" col="era"/>
                      <ThP label="WHIP" col="whip"/><ThP label="H" col="h"/>
                      <ThP label="R" col="r"/><ThP label="ER" col="er"/>
                      <ThP label="BB" col="bb"/><ThP label="K" col="so"/>
                      <ThP label="HR" col="hr"/>
                      <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">W-L-S</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {seasonPitchers.map((p, i) => {
                      const s = p.stats;
                      const gp = filteredGames.filter(g => (g.pitchers||[]).some(x => x.name?.toLowerCase() === p.name?.toLowerCase())).length;
                      const dec = p.dec || "";
                      const w = (dec.match(/W/g)||[]).length;
                      const l = (dec.match(/L/g)||[]).length;
                      const sv = (dec.match(/S/g)||[]).length;
                      return (
                        <tr key={i} className="hover:bg-sky-50/40 transition-colors">
                          <td className="px-4 py-3 sticky left-0 bg-white hover:bg-sky-50/40 font-semibold text-stone-800" style={{fontFamily:DISPLAY, fontSize:"0.85rem"}}>
                            {p.name}
                            {(team.roster||{})[p.name] && <span className="text-stone-400 text-xs ml-1.5 font-normal">{(team.roster||{})[p.name]}</span>}
                          </td>
                          <td className="px-3 py-3 text-center text-stone-500" style={{fontFamily:MONO}}>{gp}</td>
                          <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{s.ip||0}</td>
                          <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{era(s.er||0,s.ip||0)}</td>
                          <td className="px-3 py-3 text-center text-sky-700 font-semibold" style={{fontFamily:MONO}}>{whip(s.bb||0,s.h||0,s.ip||0)}</td>
                          {[s.h||0,s.r||0,s.er||0,s.bb||0,s.so||0,s.hr||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{v}</td>)}
                          <td className="px-3 py-3 text-center text-stone-500 text-xs" style={{fontFamily:MONO}}>{w}-{l}-{sv}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-stone-300 bg-stone-50 font-bold">
                      <td className="px-4 py-3 sticky left-0 bg-stone-50 text-xs uppercase tracking-wider text-stone-500">Totals</td>
                      <td className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{filteredGames.length}</td>
                      <td className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{totP.ip||0}</td>
                      <td className="px-3 py-3 text-center text-emerald-700" style={{fontFamily:MONO}}>{era(totP.er||0,totP.ip||0)}</td>
                      <td className="px-3 py-3 text-center text-sky-700" style={{fontFamily:MONO}}>{whip(totP.bb||0,totP.h||0,totP.ip||0)}</td>
                      {[totP.h||0,totP.r||0,totP.er||0,totP.bb||0,totP.so||0,totP.hr||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{v}</td>)}
                      <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{team.wins}-{team.losses}-—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* GAME LOG */}
        {tab === "game log" && (
          <div className="bg-white border border-stone-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-bold text-lg text-stone-900" style={{fontFamily:DISPLAY}}>Game Log</h2>
              <button onClick={onAddGame} className="text-sky-600 hover:text-sky-800 text-sm transition-colors">+ Add Game</button>
            </div>
            {team.games.length === 0 ? (
              <div className="text-center py-12 text-stone-400 space-y-2">
                <p>No games recorded yet</p>
                <button onClick={onAddGame} className="text-sky-600 hover:text-sky-800 text-sm">Upload game stats →</button>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {[...team.games].map((g, rawIdx) => ({ g, rawIdx })).reverse().map(({ g, rawIdx }) => (
                  <div key={rawIdx} className={`px-6 py-4 transition-colors ${g.type==="rainout"?"bg-blue-50/60 opacity-70":"hover:bg-stone-50"}`}>
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="text-stone-600 text-xs font-medium w-20 flex-shrink-0" style={{fontFamily:MONO}}>{fmtDate(g.date)}</span>
                      <span className="font-bold text-stone-800 flex-1" style={{fontFamily:DISPLAY}}>{g.opponent}</span>
                      {g.type === "rainout" ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">🌧 Rainout</span>
                      ) : g.type === "jamboree" ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">⚡ Jamboree</span>
                      ) : (
                        <span className={`font-bold text-lg ${g.result==="W"?"text-emerald-600":g.result==="L"?"text-red-600":"text-stone-500"}`} style={{fontFamily:MONO}}>
                          {g.result} {g.score}–{g.oppScore}
                        </span>
                      )}
                      {/* Action buttons */}
                      <div className="flex gap-1 ml-auto">
                        {g.type !== "rainout" && (
                          <button onClick={() => onMarkRainout(rawIdx)}
                            title="Mark as rainout"
                            className="text-xs px-2 py-1 rounded-lg border border-blue-200 text-blue-500 hover:bg-blue-50 transition-colors">
                            🌧
                          </button>
                        )}
                        <button onClick={() => onDeleteGame(rawIdx)}
                          title="Delete game"
                          className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                          🗑
                        </button>
                      </div>
                    </div>
                    {g.type !== "rainout" && (g.hitters||[]).length > 0 && (
                      <div className="mt-1 overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead><tr className="text-stone-400 border-b border-stone-100">
                            <th className="text-left py-1 pr-3">Hitter</th>
                            {["AB","H","R","RBI","HR","BB","K"].map(h=><th key={h} className="px-2 text-center">{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {g.hitters.map((p,j) => (
                              <tr key={j} className="text-stone-500 hover:text-stone-800 transition-colors">
                                <td className="py-0.5 pr-3 text-stone-700 font-medium">{p.name} <span className="text-stone-400">{p.pos}</span></td>
                                {[p.ab,p.h,p.r,p.rbi,p.hr,p.bb,p.so].map((v,k)=><td key={k} className="px-2 text-center" style={{fontFamily:MONO}}>{v}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {g.type !== "rainout" && (g.pitchers||[]).length > 0 && (
                      <div className="mt-2 overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead><tr className="text-stone-400 border-b border-stone-100">
                            <th className="text-left py-1 pr-3">Pitcher</th>
                            {["IP","H","R","ER","BB","K","Dec"].map(h=><th key={h} className="px-2 text-center">{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {g.pitchers.map((p,j) => (
                              <tr key={j} className="text-stone-500 hover:text-stone-800 transition-colors">
                                <td className="py-0.5 pr-3 text-stone-700 font-medium">{p.name}</td>
                                {[p.ip,p.h,p.r,p.er,p.bb,p.so].map((v,k)=><td key={k} className="px-2 text-center" style={{fontFamily:MONO}}>{v}</td>)}
                                <td className="px-2 text-center font-bold text-emerald-600" style={{fontFamily:MONO}}>{p.dec}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    {showGamePicker && (() => {
      // Local state lives inside IIFE via a tiny inline component trick
      const GamePickerPanel = () => {
        const [draft, setDraft] = React.useState(
          selectedGameIdxs !== null
            ? new Set(selectedGameIdxs)
            : new Set(playedGames.map(g => g._origIdx))
        );
        const toggleAll = () => {
          if (draft.size === playedGames.length) setDraft(new Set());
          else setDraft(new Set(playedGames.map(g => g._origIdx)));
        };
        const toggle = (idx) => {
          const next = new Set(draft);
          next.has(idx) ? next.delete(idx) : next.add(idx);
          setDraft(next);
        };
        const apply = () => {
          const isAll = draft.size === playedGames.length;
          setSelectedGameIdxs(isAll ? null : new Set(draft));
          setShowGamePicker(false);
        };
        return (
          <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm shadow-2xl rounded-xl overflow-hidden flex flex-col" style={{maxHeight:"80vh"}}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <h3 className="font-black text-stone-900 uppercase tracking-wide text-sm" style={{fontFamily:BODY}}>Select Games</h3>
                <button onClick={() => setShowGamePicker(false)} className="text-stone-400 hover:text-stone-800 text-2xl leading-none">&times;</button>
              </div>
              {/* Select all row */}
              <div className="px-5 py-2.5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">{draft.size} of {playedGames.length} selected</span>
                <button onClick={toggleAll} className="text-xs font-semibold text-sky-600 hover:text-sky-800 transition-colors">
                  {draft.size === playedGames.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              {/* Game list */}
              <div className="overflow-y-auto flex-1 divide-y divide-stone-50">
                {playedGames.map(g => {
                  const checked = draft.has(g._origIdx);
                  const isConf = isConferenceGame(g, team);
                  return (
                    <button key={g._origIdx} onClick={() => toggle(g._origIdx)}
                      className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-colors ${checked ? "bg-white hover:bg-sky-50/40" : "bg-stone-50/60 opacity-50 hover:opacity-80"}`}>
                      <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-all ${checked ? "bg-sky-600 border-sky-600" : "border-stone-300 bg-white"}`}>
                        {checked && <span className="text-white text-xs font-black leading-none">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-800 text-sm truncate" style={{fontFamily:DISPLAY}}>{g.opponent}</span>
                          {isConf && <span className="text-xs text-sky-500 font-bold flex-shrink-0">CONF</span>}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">{fmtDate(g.date)}</div>
                      </div>
                      {g.result && (
                        <span className={`text-sm font-black flex-shrink-0 ${g.result==="W"?"text-emerald-600":g.result==="L"?"text-red-500":"text-stone-400"}`} style={{fontFamily:MONO}}>
                          {g.result} {g.score}–{g.oppScore}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="px-5 py-4 border-t border-stone-100 flex gap-3">
                <button onClick={() => setShowGamePicker(false)} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 text-sm font-semibold hover:bg-stone-50 transition-colors">Cancel</button>
                <button onClick={apply} disabled={draft.size === 0}
                  className="flex-1 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-sm font-bold transition-colors disabled:opacity-40">
                  Apply ({draft.size} game{draft.size!==1?"s":""})
                </button>
              </div>
            </div>
          </div>
        );
      };
      return <GamePickerPanel key="game-picker" />;
    })()}

    {showGrades && (
      <RosterGradeModal
        team={team}
        onClose={() => setShowGrades(false)}
        onSave={(roster) => { onUpdateRoster(team.name, roster); }}
      />
    )}
    </>
  );
}

// ── Team Logo Wall (hero background) ────────────────────────────────────────
// Shows every Metro League team's logo/badge once, centered and evenly
// spaced across the hero banner, in place of the old skyline photo.
function TeamLogoWall() {
  const names = Object.keys(TEAM_META);
  return (
    <div style={{ position:"absolute", inset:0 }}>
      <div style={{
        display:"flex", flexWrap:"wrap", alignContent:"center", justifyContent:"center",
        gap:14, padding:16, height:"100%", overflow:"hidden",
      }}>
        {names.map((name) => {
          const meta = TEAM_META[name] || { bg:"#334155", text:"#ffffff", init:"?" };
          const logo = TEAM_LOGOS[name];
          return (
            <div key={name} style={{
              width:48, height:48, borderRadius:10, flexShrink:0,
              background: "#ffffff", display:"flex", alignItems:"center",
              justifyContent:"center", overflow:"hidden",
            }}>
              {logo
                ? <img src={logo} alt="" style={{width:"100%", height:"100%", objectFit:"contain", padding:4}} />
                : <span style={{color:meta.bg, fontFamily:DISPLAY, fontWeight:900, fontSize:13}}>{meta.init}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sortable Table Header ─────────────────────────────────────────────────────
function SortTh({ label, col, sort, setSort, className="" }) {
  const active = sort.col === col;
  return (
    <th className={`px-3 py-3 text-center cursor-pointer select-none group transition-colors hover:bg-stone-100 ${className}`}
      onClick={() => setSort(s => {
        const ascCols = new Set(["era","whip","losses"]);
        if (s.col !== col) return { col, dir: ascCols.has(col) ? "asc" : "desc" };
        return { col, dir: s.dir === "asc" ? "desc" : "asc" };
      })}>
      <span className={`flex items-center justify-center gap-1 text-xs uppercase tracking-wider font-bold ${active?"text-sky-700":"text-stone-400 group-hover:text-stone-600"}`}
        style={{fontFamily:BODY}}>
        {label}
        <span className="text-xs">{active ? (sort.dir==="asc"?"↑":"↓") : "↕"}</span>
      </span>
    </th>
  );
}

// ── Streak badge ──────────────────────────────────────────────────────────────
function StreakBadge({ games }) {
  if (!games || games.length === 0) return null;
  const sorted = [...games].sort((a,b) => (b.date||"").localeCompare(a.date||""));
  const last = sorted[0]?.result;
  if (!last || last === "T") return null;
  let count = 0;
  for (const g of sorted) { if (g.result === last) count++; else break; }
  if (count < 2) return null;
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ml-1 ${last==="W"?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-600"}`}
      style={{fontFamily:MONO}}>{last}{count}</span>
  );
}

// ── League-wide player helpers ────────────────────────────────────────────────
function getAllPlayers(teams, type, leagueOnly = false) {
  const map = {};
  teams.forEach(team => {
    const gamesPlayed = team.games.filter(g => g.type !== 'rainout').length;
    const threshold = gamesPlayed / 2;
    team.games.filter(g => g.type !== 'rainout' && (!leagueOnly || isConferenceGame(g, team))).forEach(game => {
      const players = type === "hitting" ? (game.hitters||[]) : (game.pitchers||[]);
      players.forEach(p => {
        if (!p.name) return;
        const key = `${team.name}::${p.name}`;
        if (!map[key]) map[key] = { name: p.name, team: team.name, gamesPlayed, threshold, games: 0, stats: {}, grade: (team.roster||{})[p.name] || "", posCounts: {} };
        map[key].games++;
        if (p.pos) { const pos = p.pos.split(/[,\/\s]+/)[0].trim(); if (pos) map[key].posCounts[pos] = (map[key].posCounts[pos]||0)+1; }
        const s = map[key].stats;
        if (type === "hitting") {
          s.ab  = (s.ab||0)  + toInt(p.ab);
          s.h   = (s.h||0)   + toInt(p.h);
          s.r   = (s.r||0)   + toInt(p.r);
          s.rbi = (s.rbi||0) + toInt(p.rbi);
          s.hr  = (s.hr||0)  + toInt(p.hr);
          s.bb  = (s.bb||0)  + toInt(p.bb);
          s.so  = (s.so||0)  + toInt(p.so);
          s["2b"] = (s["2b"]||0) + toInt(p["2b"]);
          s["3b"] = (s["3b"]||0) + toInt(p["3b"]);
          s.sb  = (s.sb||0)  + toInt(p.sb);
        } else {
          s.ip  = outsToIp(ipToOuts(s.ip||0) + ipToOuts(p.ip||0));
          s.h   = (s.h||0)   + toInt(p.h);
          s.r   = (s.r||0)   + toInt(p.r);
          s.er  = (s.er||0)  + toInt(p.er);
          s.bb  = (s.bb||0)  + toInt(p.bb);
          s.so  = (s.so||0)  + toInt(p.so);
          s.hr  = (s.hr||0)  + toInt(p.hr);
          if (p.dec === "W") s.w = (s.w||0)+1;
          if (p.dec === "L") s.l = (s.l||0)+1;
          if (p.dec === "S") s.sv = (s.sv||0)+1;
        }
      });
    });
  });
  return Object.values(map).map(p => ({
    ...p,
    pos: Object.keys(p.posCounts||{}).sort((a,b) => p.posCounts[b]-p.posCounts[a])[0] || ""
  }));
}

function getQualifiedPlayers(teams, type, leagueOnly = false) {
  const all = getAllPlayers(teams, type, leagueOnly).filter(p => p.gamesPlayed > 0);
  if (type === "hitting") {
    const maxAB = Math.max(0, ...all.map(p => p.stats.ab || 0));
    const minAB = Math.floor(maxAB * 0.5);
    return all.filter(p => (p.stats.ab || 0) >= Math.max(1, minAB));
  }
  // Pitching: at least 40% of leader's IP
  const maxIP = Math.max(0, ...all.map(p => p.stats.ip || 0));
  const minIP = Math.max(0.1, maxIP * 0.4);
  return all.filter(p => (p.stats.ip || 0) >= minIP);
}


// ── WAR-Lite shared helpers (used by WARLitePage and AllPlayersPage) ───────────
const WOBA_SCALE = 1.15; // ~league-average wOBA scale for HS ball
function computeWoba(p) {
  const ab = p.stats.ab || 0;
  const bb = p.stats.bb || 0;
  const h  = p.stats.h  || 0;
  const d  = p.stats["2b"] || 0;
  const t  = p.stats["3b"] || 0;
  const hr = p.stats.hr || 0;
  const s  = h - d - t - hr;
  const pa = ab + bb;
  if (pa === 0) return 0;
  return (0.69*bb + 0.89*s + 1.27*d + 1.62*t + 2.10*hr) / pa;
}
function computeLeagueWoba(qualHitters) {
  const lgAB  = qualHitters.reduce((s,p) => s + (p.stats.ab||0), 0);
  const lgH   = qualHitters.reduce((s,p) => s + (p.stats.h||0), 0);
  const lgBB  = qualHitters.reduce((s,p) => s + (p.stats.bb||0), 0);
  const lgHR  = qualHitters.reduce((s,p) => s + (p.stats.hr||0), 0);
  const lg2B  = qualHitters.reduce((s,p) => s + (p.stats["2b"]||0), 0);
  const lg3B  = qualHitters.reduce((s,p) => s + (p.stats["3b"]||0), 0);
  const lgPA = lgAB + lgBB;
  const lgSingles = lgH - lg2B - lg3B - lgHR;
  return lgPA > 0
    ? (0.69*lgBB + 0.89*lgSingles + 1.27*lg2B + 1.62*lg3B + 2.10*lgHR) / lgPA
    : 0.320;
}
function computeHitterWarLite(p, lgWoba) {
  const pa = (p.stats.ab||0) + (p.stats.bb||0);
  const wobaDiff = computeWoba(p) - lgWoba;
  const runsAboveAvg = (wobaDiff / WOBA_SCALE) * pa;
  return runsAboveAvg / 10; // 10 runs per win
}
function computeFipConstant(qualPitchers) {
  const lgPitchIP = qualPitchers.reduce((s,p) => s + ipToDecimal(p.stats.ip||0), 0);
  const lgPitchER = qualPitchers.reduce((s,p) => s + (p.stats.er||0), 0);
  const lgPitchHR = qualPitchers.reduce((s,p) => s + (p.stats.hr||0), 0);
  const lgPitchBB = qualPitchers.reduce((s,p) => s + (p.stats.bb||0), 0);
  const lgPitchK  = qualPitchers.reduce((s,p) => s + (p.stats.so||0), 0);
  const lgERA = lgPitchIP > 0 ? (lgPitchER * 9) / lgPitchIP : 4.50;
  const lgFIPcore = lgPitchIP > 0 ? (13*lgPitchHR + 3*lgPitchBB - 2*lgPitchK) / lgPitchIP : 0;
  return { lgERA, FIPconstant: lgERA - lgFIPcore };
}
function computeFip(p, FIPconstant) {
  const ipd = ipToDecimal(p.stats.ip || 0);
  if (ipd === 0) return 99;
  return (13*(p.stats.hr||0) + 3*(p.stats.bb||0) - 2*(p.stats.so||0)) / ipd + FIPconstant;
}
function computePitcherWarLite(p, lgERA, FIPconstant) {
  const ipd = ipToDecimal(p.stats.ip || 0);
  const fipDiff = lgERA - computeFip(p, FIPconstant);
  return (fipDiff / 9) * ipd / 10;
}

// ── WAR-Lite Page ──────────────────────────────────────────────────────────────
// Hitting: wRC+ equivalent using AVG, OBP, SLG relative to league average
// Pitching: FIP (Fielding Independent Pitching) relative to league FIP
// "WAR-Lite" score = run value above/below average, scaled to wins (10 R/W)
function WARLitePage({ teams, onTeamClick }) {
  const [hitSort, setHitSort] = useState("warLite");
  const [pitSort, setPitSort] = useState("warLite");

  // ── Qualification thresholds (same as leaderboard) ──
  const allHitters  = getAllPlayers(teams, "hitting");
  const allPitchers = getAllPlayers(teams, "pitching");
  const maxAB = Math.max(0, ...allHitters.map(p => p.stats.ab || 0));
  const maxIP = Math.max(0, ...allPitchers.map(p => p.stats.ip || 0));
  const qualHitters  = allHitters.filter(p => (p.stats.ab || 0) >= Math.max(1, Math.floor(maxAB * 0.5)));
  const qualPitchers = allPitchers.filter(p => (p.stats.ip || 0) >= Math.max(0.1, maxIP * 0.4));

  // ── League average stats for hitters ──
  const lgAB  = qualHitters.reduce((s,p) => s + (p.stats.ab||0), 0);
  const lgH   = qualHitters.reduce((s,p) => s + (p.stats.h||0), 0);
  const lgBB  = qualHitters.reduce((s,p) => s + (p.stats.bb||0), 0);
  const lgHR  = qualHitters.reduce((s,p) => s + (p.stats.hr||0), 0);
  const lg2B  = qualHitters.reduce((s,p) => s + (p.stats["2b"]||0), 0);
  const lg3B  = qualHitters.reduce((s,p) => s + (p.stats["3b"]||0), 0);
  // wOBA weights (simplified, standard): BB=0.69, 1B=0.89, 2B=1.27, 3B=1.62, HR=2.10
  const woba = (p) => {
    const ab = p.stats.ab || 0;
    const bb = p.stats.bb || 0;
    const h  = p.stats.h  || 0;
    const d  = p.stats["2b"] || 0;
    const t  = p.stats["3b"] || 0;
    const hr = p.stats.hr || 0;
    const s  = h - d - t - hr;
    const pa = ab + bb;
    if (pa === 0) return 0;
    return (0.69*bb + 0.89*s + 1.27*d + 1.62*t + 2.10*hr) / pa;
  };
  const lgPA = lgAB + lgBB;
  const lgSingles = lgH - lg2B - lg3B - lgHR;
  const lgWoba = lgPA > 0
    ? (0.69*lgBB + 0.89*lgSingles + 1.27*lg2B + 1.62*lg3B + 2.10*lgHR) / lgPA
    : 0.320;

  // wRC: (wOBA - lgWoba) / wOBAScale * PA; wOBAScale ~1.15 for HS
  const wOBAScale = 1.15;
  const hitterWarLite = (p) => {
    const pa = (p.stats.ab||0) + (p.stats.bb||0);
    const wobaDiff = woba(p) - lgWoba;
    const runsAboveAvg = (wobaDiff / wOBAScale) * pa;
    return runsAboveAvg / 10; // 10 runs per win
  };

  // ── League FIP constant ──
  // FIP = (13*HR + 3*BB - 2*K) / IP_decimal + FIP_constant
  // FIP_constant = lgERA - (13*lgHR + 3*lgBB - 2*lgK) / lgIP_decimal
  const lgPitchIP    = qualPitchers.reduce((s,p) => s + ipToDecimal(p.stats.ip||0), 0);
  const lgPitchER    = qualPitchers.reduce((s,p) => s + (p.stats.er||0), 0);
  const lgPitchHR    = qualPitchers.reduce((s,p) => s + (p.stats.hr||0), 0);
  const lgPitchBB    = qualPitchers.reduce((s,p) => s + (p.stats.bb||0), 0);
  const lgPitchK     = qualPitchers.reduce((s,p) => s + (p.stats.so||0), 0);
  const lgERA = lgPitchIP > 0 ? (lgPitchER * 9) / lgPitchIP : 4.50;
  const lgFIPcore = lgPitchIP > 0 ? (13*lgPitchHR + 3*lgPitchBB - 2*lgPitchK) / lgPitchIP : 0;
  const FIPconstant = lgERA - lgFIPcore;

  const fip = (p) => {
    const ipd = ipToDecimal(p.stats.ip || 0);
    if (ipd === 0) return 99;
    return (13*(p.stats.hr||0) + 3*(p.stats.bb||0) - 2*(p.stats.so||0)) / ipd + FIPconstant;
  };

  // Pitcher WAR-Lite: (lgFIP - playerFIP) / 9 * IP_decimal / 10
  const pitcherWarLite = (p) => {
    const ipd = ipToDecimal(p.stats.ip || 0);
    const fipDiff = lgERA - fip(p); // positive = better than average
    return (fipDiff / 9) * ipd / 10;
  };

  // ── Build rows ──
  const hitRows = qualHitters.map(p => ({
    ...p,
    woba:    woba(p),
    warLite: hitterWarLite(p),
    pa:      (p.stats.ab||0) + (p.stats.bb||0),
  }));
  const pitRows = qualPitchers.map(p => ({
    ...p,
    fip:     fip(p),
    warLite: pitcherWarLite(p),
    ipd:     ipToDecimal(p.stats.ip || 0),
  }));

  const sortedHit  = [...hitRows].sort((a,b) => {
    if (hitSort === "warLite") return b.warLite - a.warLite;
    if (hitSort === "woba")    return b.woba    - a.woba;
    if (hitSort === "avg")     return (b.stats.h/Math.max(1,b.stats.ab)) - (a.stats.h/Math.max(1,a.stats.ab));
    if (hitSort === "pa")      return b.pa - a.pa;
    return 0;
  });
  const sortedPit  = [...pitRows].sort((a,b) => {
    if (pitSort === "warLite") return b.warLite - a.warLite;
    if (pitSort === "fip")     return a.fip - b.fip;
    if (pitSort === "era")     return parseFloat(era(a.stats.er||0,a.stats.ip||0)) - parseFloat(era(b.stats.er||0,b.stats.ip||0));
    if (pitSort === "ip")      return b.ipd - a.ipd;
    return 0;
  });

  const SortBtn = ({ col, label, active, onClick }) => (
    <button onClick={onClick}
      className={"text-xs font-bold px-3 py-1.5 rounded-lg transition-all " + (active ? "bg-sky-700 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200")}>
      {label}
    </button>
  );

  const noData = qualHitters.length === 0 && qualPitchers.length === 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="bg-white border border-stone-200 px-6 py-5">
        <h2 className="text-2xl font-black text-stone-900 mb-1" style={{fontFamily:DISPLAY}}>⚡ WAR-Lite</h2>
        <p className="text-sm text-stone-500 leading-relaxed max-w-2xl">
          Simplified value metrics using league-relative formulas. <strong>Hitters</strong>: wRC-based run value above average (wOBA vs. league wOBA). <strong>Pitchers</strong>: FIP-based run prevention above average. Both scaled to wins at 10 runs/win.
        </p>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-stone-50 rounded px-3 py-2 text-center">
            <div className="text-xs text-stone-400 uppercase tracking-wide">Lg wOBA</div>
            <div className="font-black text-stone-800" style={{fontFamily:MONO}}>{lgWoba.toFixed(3).replace(/^0/,"")}</div>
          </div>
          <div className="bg-stone-50 rounded px-3 py-2 text-center">
            <div className="text-xs text-stone-400 uppercase tracking-wide">Lg ERA</div>
            <div className="font-black text-stone-800" style={{fontFamily:MONO}}>{lgERA.toFixed(2)}</div>
          </div>
          <div className="bg-stone-50 rounded px-3 py-2 text-center">
            <div className="text-xs text-stone-400 uppercase tracking-wide">Lg FIP</div>
            <div className="font-black text-stone-800" style={{fontFamily:MONO}}>{lgPitchIP > 0 ? (lgFIPcore + FIPconstant).toFixed(2) : "—"}</div>
          </div>
          <div className="bg-stone-50 rounded px-3 py-2 text-center">
            <div className="text-xs text-stone-400 uppercase tracking-wide">FIP Const</div>
            <div className="font-black text-stone-800" style={{fontFamily:MONO}}>{FIPconstant.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {noData && (
        <div className="text-center py-16 text-stone-400 text-sm">No game stats uploaded yet.</div>
      )}

      {/* Hitting Table */}
      {qualHitters.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-lg font-bold text-stone-800" style={{fontFamily:DISPLAY}}>⚾ Hitters</h3>
            <div className="flex gap-2 flex-wrap">
              {[["warLite","WAR-Lite"],["woba","wOBA"],["avg","AVG"],["pa","PA"]].map(([k,l]) => (
                <SortBtn key={k} col={k} label={l} active={hitSort===k} onClick={()=>setHitSort(k)} />
              ))}
            </div>
          </div>
          <div className="bg-white border border-stone-200 overflow-x-auto" style={{maxHeight:"70vh", overflowY:"auto"}}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 sticky top-0 z-20">
                  <th className="px-3 py-2 text-left text-xs font-bold text-stone-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-stone-500 uppercase tracking-wide">Player</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-stone-500 uppercase tracking-wide">PA</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-stone-500 uppercase tracking-wide">AVG</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-stone-500 uppercase tracking-wide">OBP</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-sky-700 uppercase tracking-wide">wOBA</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-emerald-700 uppercase tracking-wide">WAR-Lite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sortedHit.map((p, i) => {
                  const wl = p.warLite;
                  const wlColor = wl > 0.5 ? "text-emerald-700" : wl > 0 ? "text-emerald-600" : wl > -0.5 ? "text-orange-500" : "text-red-600";
                  return (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-stone-50/50"}>
                      <td className="px-3 py-2.5 text-center text-xs text-stone-400 font-bold" style={{fontFamily:MONO}}>{i+1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-stone-800" style={{fontFamily:DISPLAY}}>{p.name}
                          {p.grade && <span className="ml-1 text-xs font-normal text-stone-400">{p.grade}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <TeamBadge name={p.team} size="xs" />
                          <button onClick={()=>onTeamClick(p.team)} className="text-xs text-sky-600 hover:text-sky-800">{p.team}</button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center" style={{fontFamily:MONO}}>{p.pa}</td>
                      <td className="px-3 py-2.5 text-center" style={{fontFamily:MONO}}>{avg(p.stats.h||0, p.stats.ab||0)}</td>
                      <td className="px-3 py-2.5 text-center" style={{fontFamily:MONO}}>{avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0))}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-sky-700" style={{fontFamily:MONO}}>{p.woba.toFixed(3).replace(/^0/,"")}</td>
                      <td className={"px-3 py-2.5 text-center font-black " + wlColor} style={{fontFamily:MONO}}>{wl >= 0 ? "+" : ""}{wl.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-400 mt-1.5">League wOBA: {lgWoba.toFixed(3).replace(/^0/,"")} · Qual: {Math.floor(maxAB * 0.5)}+ AB · {qualHitters.length} players</p>
        </div>
      )}

      {/* Pitching Table */}
      {qualPitchers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-lg font-bold text-stone-800" style={{fontFamily:DISPLAY}}>⚡ Pitchers</h3>
            <div className="flex gap-2 flex-wrap">
              {[["warLite","WAR-Lite"],["fip","FIP"],["era","ERA"],["ip","IP"]].map(([k,l]) => (
                <SortBtn key={k} col={k} label={l} active={pitSort===k} onClick={()=>setPitSort(k)} />
              ))}
            </div>
          </div>
          <div className="bg-white border border-stone-200 overflow-x-auto" style={{maxHeight:"70vh", overflowY:"auto"}}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 sticky top-0 z-20">
                  <th className="px-3 py-2 text-left text-xs font-bold text-stone-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-bold text-stone-500 uppercase tracking-wide">Player</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-stone-500 uppercase tracking-wide">IP</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-stone-500 uppercase tracking-wide">ERA</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-stone-500 uppercase tracking-wide">WHIP</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-sky-700 uppercase tracking-wide">FIP</th>
                  <th className="px-3 py-2 text-center text-xs font-bold text-emerald-700 uppercase tracking-wide">WAR-Lite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {sortedPit.map((p, i) => {
                  const wl = p.warLite;
                  const wlColor = wl > 0.5 ? "text-emerald-700" : wl > 0 ? "text-emerald-600" : wl > -0.5 ? "text-orange-500" : "text-red-600";
                  const fipVal = p.fip;
                  const fipColor = fipVal < lgERA ? "text-emerald-700" : fipVal < lgERA * 1.2 ? "text-sky-700" : "text-orange-500";
                  return (
                    <tr key={i} className={i % 2 === 0 ? "" : "bg-stone-50/50"}>
                      <td className="px-3 py-2.5 text-center text-xs text-stone-400 font-bold" style={{fontFamily:MONO}}>{i+1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-stone-800" style={{fontFamily:DISPLAY}}>{p.name}
                          {p.grade && <span className="ml-1 text-xs font-normal text-stone-400">{p.grade}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <TeamBadge name={p.team} size="xs" />
                          <button onClick={()=>onTeamClick(p.team)} className="text-xs text-sky-600 hover:text-sky-800">{p.team}</button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center" style={{fontFamily:MONO}}>{p.stats.ip}</td>
                      <td className="px-3 py-2.5 text-center" style={{fontFamily:MONO}}>{era(p.stats.er||0, p.stats.ip||0)}</td>
                      <td className="px-3 py-2.5 text-center" style={{fontFamily:MONO}}>{whip(p.stats.bb||0, p.stats.h||0, p.stats.ip||0)}</td>
                      <td className={"px-3 py-2.5 text-center font-bold " + fipColor} style={{fontFamily:MONO}}>{fipVal >= 99 ? "—" : fipVal.toFixed(2)}</td>
                      <td className={"px-3 py-2.5 text-center font-black " + wlColor} style={{fontFamily:MONO}}>{wl >= 0 ? "+" : ""}{wl.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-400 mt-1.5">Lg ERA: {lgERA.toFixed(2)} · FIP const: {FIPconstant.toFixed(2)} · Qual: {(maxIP * 0.4).toFixed(1)}+ IP · {qualPitchers.length} pitchers</p>
        </div>
      )}
    </div>
  );
}

// ── Leaderboards Page ─────────────────────────────────────────────────────────
function LeaderboardsPage({ teams, onTeamClick }) {
  const [pitchTab, setPitchTab] = useState("era");
  const [hitTab, setHitTab] = useState("avg");

  const allHitPlayers = getAllPlayers(teams, "hitting");
  const allPitPlayers = getAllPlayers(teams, "pitching");
  const maxAB = Math.max(0, ...allHitPlayers.map(p => p.stats.ab || 0));
  const maxIP = Math.max(0, ...allPitPlayers.map(p => p.stats.ip || 0));
  const hitters = allHitPlayers.filter(p => (p.stats.ab || 0) >= Math.max(1, Math.floor(maxAB * 0.5)));
  const pitchers = allPitPlayers.filter(p => (p.stats.ip || 0) >= Math.max(0.1, maxIP * 0.4));

  const hitCats = [
    { key:"avg", label:"AVG", fn: p => parseFloat(avg(p.stats.h||0, p.stats.ab||0)||0), fmt: p => avg(p.stats.h||0, p.stats.ab||0), desc: true },
    { key:"hr",  label:"HR",  fn: p => p.stats.hr||0,  fmt: p => p.stats.hr||0, desc: true },
    { key:"rbi", label:"RBI", fn: p => p.stats.rbi||0, fmt: p => p.stats.rbi||0, desc: true },
    { key:"r",   label:"R",   fn: p => p.stats.r||0,   fmt: p => p.stats.r||0,  desc: true },
    { key:"h",   label:"H",   fn: p => p.stats.h||0,   fmt: p => p.stats.h||0,  desc: true },
    { key:"sb",  label:"SB",  fn: p => p.stats.sb||0,  fmt: p => p.stats.sb||0, desc: true },
    { key:"obp", label:"OBP", fn: p => parseFloat(avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0))||0), fmt: p => avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0)), desc: true },
  ];
  const pitchCats = [
    { key:"era",  label:"ERA",  fn: p => parseFloat(era(p.stats.er||0,p.stats.ip||0)), fmt: p => era(p.stats.er||0,p.stats.ip||0), desc: false },
    { key:"so",   label:"K",    fn: p => p.stats.so||0,  fmt: p => p.stats.so||0, desc: true },
    { key:"whip", label:"WHIP", fn: p => parseFloat(whip(p.stats.bb||0,p.stats.h||0,p.stats.ip||0)), fmt: p => whip(p.stats.bb||0,p.stats.h||0,p.stats.ip||0), desc: false },
    { key:"w",    label:"W",    fn: p => p.stats.w||0,   fmt: p => p.stats.w||0, desc: true },
    { key:"sv",   label:"SV",   fn: p => p.stats.sv||0,  fmt: p => p.stats.sv||0, desc: true },
    { key:"ip",   label:"IP",   fn: p => p.stats.ip||0,  fmt: p => p.stats.ip||0, desc: true },
  ];

  const activePitch = pitchCats.find(c=>c.key===pitchTab);
  const activeHit   = hitCats.find(c=>c.key===hitTab);

  const top10Hit   = [...hitters].sort((a,b)=> activeHit.desc ? activeHit.fn(b)-activeHit.fn(a) : activeHit.fn(a)-activeHit.fn(b)).slice(0,10);
  const top10Pitch = [...pitchers].sort((a,b)=> activePitch.desc ? activePitch.fn(b)-activePitch.fn(a) : activePitch.fn(a)-activePitch.fn(b)).slice(0,10);

  const medals = ["🥇","🥈","🥉"];

  const LeaderList = ({ players, cats, activeKey, setActive, fmt }) => (
    <div className="bg-white border border-stone-200 overflow-hidden">
      <div className="px-6 py-3 border-b border-stone-100 flex items-center gap-2 flex-wrap">
        {cats.map(c => (
          <button key={c.key} onClick={()=>setActive(c.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${activeKey===c.key?"bg-sky-700 text-white":"bg-stone-100 text-stone-500 hover:bg-stone-200"}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="divide-y divide-stone-50">
        {players.map((p, i) => (
          <div key={i} className={`px-6 py-3 flex items-center gap-3 ${i<3?"bg-amber-50/40":""}`}>
            <span className="w-7 text-center text-sm">{medals[i] || <span className="text-stone-400 font-bold" style={{fontFamily:MONO}}>{i+1}</span>}</span>
            <TeamBadge name={p.team} size="xs" />
            <div className="flex-1 min-w-0">
              <span className="font-bold text-stone-800 text-sm" style={{fontFamily:DISPLAY}}>{p.name}</span>
              <button onClick={()=>onTeamClick(p.team)} className="block text-xs text-sky-600 hover:text-sky-800 transition-colors">{p.team}</button>
            </div>
            <span className="font-black text-lg text-stone-800" style={{fontFamily:MONO}}>{fmt(p)}</span>
          </div>
        ))}
        {players.length === 0 && <div className="text-center py-10 text-stone-400 text-sm">No data yet — upload game stats to populate leaderboards.</div>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2" style={{fontFamily:DISPLAY}}>⚾ Hitting Leaders <span className="text-sm font-normal text-stone-400">top 10</span></h3>
          <LeaderList players={top10Hit} cats={hitCats} activeKey={hitTab} setActive={setHitTab} fmt={activeHit.fmt} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center gap-2" style={{fontFamily:DISPLAY}}>⚡ Pitching Leaders <span className="text-sm font-normal text-stone-400">top 10</span></h3>
          <LeaderList players={top10Pitch} cats={pitchCats} activeKey={pitchTab} setActive={setPitchTab} fmt={activePitch.fmt} />
        </div>
      </div>
    </div>
  );
}

// ── Team Stats Page ───────────────────────────────────────────────────────────
function TeamStatsPage({ teams, onTeamClick }) {
  const [sort, setSort] = useState({ col:"pct", dir:"desc" });
  const [view, setView] = useState("hitting"); // hitting | pitching | standings

  const rows = teams.map(t => {
    const gp = t.wins + t.losses;
    const pct = gp===0 ? 0 : t.wins/gp;
    // Compute hitting/pitching live from games array
    const liveGames = t.games.filter(g => g.type !== "rainout");
    const hit = { ab:0,h:0,r:0,rbi:0,hr:0,bb:0,so:0,"2b":0,"3b":0,sb:0 };
    const pit = { ip:0,h:0,r:0,er:0,bb:0,so:0,hr:0,w:0,l:0,sv:0 };
    liveGames.forEach(g => {
      (g.hitters||[]).forEach(p => {
        hit.ab+= toInt(p.ab); hit.h+=toInt(p.h); hit.r+=toInt(p.r);
        hit.rbi+=toInt(p.rbi); hit.hr+=toInt(p.hr); hit.bb+=toInt(p.bb);
        hit.so+=toInt(p.so); hit["2b"]+=toInt(p["2b"]); hit["3b"]+=toInt(p["3b"]); hit.sb+=toInt(p.sb);
      });
      (g.pitchers||[]).forEach(p => {
        pit.ip=outsToIp(ipToOuts(pit.ip)+ipToOuts(p.ip||0)); pit.h+=toInt(p.h); pit.r+=toInt(p.r);
        pit.er+=toInt(p.er); pit.bb+=toInt(p.bb); pit.so+=toInt(p.so); pit.hr+=toInt(p.hr);
        if (p.dec==="W") pit.w++; if (p.dec==="L") pit.l++; if (p.dec==="S") pit.sv++;
      });
    });
    return { name: t.name, wins: t.wins, losses: t.losses, pct, gp,
      avg: parseFloat(avg(hit.h, hit.ab)||0),
      r: hit.r, hr: hit.hr, rbi: hit.rbi,
      h: hit.h, bb: hit.bb, so: hit.so,
      sb: hit.sb, xb2: hit["2b"]||0, xb3: hit["3b"]||0,
      obp: parseFloat(avg((hit.h||0)+(hit.bb||0),(hit.ab||0)+(hit.bb||0))||0),
      era: parseFloat(era(pit.er, pit.ip)),
      whip: parseFloat(whip(pit.bb, pit.h, pit.ip)),
      ip: pit.ip, pSo: pit.so, pBb: pit.bb,
      pH: pit.h, pHr: pit.hr, w: pit.w, sv: pit.sv,
    };
  });

  const colMap = { pct:"pct", wins:"wins", losses:"losses", avg:"avg", r:"r", hr:"hr", rbi:"rbi",
    h:"h", bb:"bb", so:"so", sb:"sb", obp:"obp", era:"era", whip:"whip",
    ip:"ip", pSo:"pSo", pBb:"pBb", pH:"pH", pHr:"pHr", sv:"sv",
    "2b":"xb2", "3b":"xb3" };
  const descCols = new Set(["pct","wins","avg","r","hr","rbi","h","bb","so","sb","obp","ip","pSo","w","sv","2b","3b"]);

  const sorted = [...rows].sort((a,b) => {
    const col = colMap[sort.col] || sort.col;
    const asc = sort.dir === "asc";
    const av = parseFloat(a[col]) || 0;
    const bv = parseFloat(b[col]) || 0;
    return asc ? av-bv : bv-av;
  });

  const Th = ({label, col}) => <SortTh label={label} col={col} sort={sort} setSort={setSort} />;

  return (
    <div className="bg-white border border-stone-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-bold text-stone-800" style={{fontFamily:DISPLAY}}>Team Stats</h3>
        <div className="flex gap-1 bg-stone-100 p-1 rounded-xl">
          {["standings","hitting","pitching"].map(v => (
            <button key={v} onClick={()=>{ setView(v); setSort({col: v==="pitching"?"era":v==="hitting"?"avg":"pct", dir: v==="pitching"?"asc":"desc"}); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${view===v?"bg-white text-stone-900 shadow-sm":"text-stone-500 hover:text-stone-700"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto" style={{maxHeight:"70vh", overflowY:"auto"}}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-100 sticky top-0 z-20">
              <th className="text-left px-4 py-3 text-xs font-bold text-stone-400 uppercase tracking-wider sticky left-0 bg-stone-50">Team</th>
              {view === "standings" && <>
                <Th label="W" col="wins"/><Th label="L" col="losses"/><Th label="PCT" col="pct"/>
                <Th label="R" col="r"/><Th label="HR" col="hr"/><Th label="AVG" col="avg"/>
                <Th label="ERA" col="era"/>
              </>}
              {view === "hitting" && <>
                <Th label="AVG" col="avg"/><Th label="OBP" col="obp"/>
                <Th label="H" col="h"/><Th label="R" col="r"/><Th label="HR" col="hr"/>
                <Th label="RBI" col="rbi"/><Th label="2B" col="2b"/><Th label="BB" col="bb"/>
                <Th label="K" col="so"/><Th label="SB" col="sb"/>
              </>}
              {view === "pitching" && <>
                <Th label="ERA" col="era"/><Th label="WHIP" col="whip"/>
                <Th label="IP" col="ip"/><Th label="K" col="pSo"/>
                <Th label="BB" col="pBb"/><Th label="H" col="pH"/>
                <Th label="HR" col="pHr"/><Th label="SV" col="sv"/>
              </>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {sorted.map((t,i) => (
              <tr key={t.name} className="hover:bg-sky-50/40 transition-colors group">
                <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-sky-50/40">
                  <button onClick={()=>onTeamClick(t.name)} className="flex items-center gap-2 group-hover:text-sky-700 transition-colors">
                    <TeamBadge name={t.name} size="sm"/>
                    <span className="font-bold text-stone-800 group-hover:text-sky-700 whitespace-nowrap" style={{fontFamily:DISPLAY, fontSize:"0.85rem"}}>{t.name}</span>
                  </button>
                </td>
                {view === "standings" && <>
                  <td className="px-3 py-3 text-center font-semibold text-emerald-700" style={{fontFamily:MONO}}>{t.wins}</td>
                  <td className="px-3 py-3 text-center font-semibold text-red-600" style={{fontFamily:MONO}}>{t.losses}</td>
                  <td className="px-3 py-3 text-center font-bold text-stone-800" style={{fontFamily:MONO}}>{t.gp===0?".000":t.pct.toFixed(3).replace(/^0/,"")}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.r}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.hr}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.avg===0?".000":t.avg.toFixed(3).replace(/^0/,"")}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.era.toFixed(2)}</td>
                </>}
                {view === "hitting" && <>
                  <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{t.avg===0?".000":t.avg.toFixed(3).replace(/^0/,"")}</td>
                  <td className="px-3 py-3 text-center font-semibold text-sky-700" style={{fontFamily:MONO}}>{t.obp===0?".000":t.obp.toFixed(3).replace(/^0/,"")}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.h}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.r}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.hr}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.rbi}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.xb2}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.bb}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.so}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.sb}</td>
                </>}
                {view === "pitching" && <>
                  <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{t.era.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center font-semibold text-sky-700" style={{fontFamily:MONO}}>{t.whip.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.ip}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.pSo}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.pBb}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.pH}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.pHr}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{t.sv}</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── All Players Page ──────────────────────────────────────────────────────────
function AllPlayersPage({ teams, onTeamClick }) {
  const [view, setView] = useState("hitting");
  const [sortH, setSortH] = useState({ col:"avg", dir:"desc" });
  const [sortP, setSortP] = useState({ col:"era", dir:"asc" });
  const [leagueOnly, setLeagueOnly] = useState(false);
  const [search, setSearch] = useState("");

  const qualHitters  = getQualifiedPlayers(teams, "hitting", leagueOnly);
  const qualPitchers = getQualifiedPlayers(teams, "pitching", leagueOnly);

  // WAR-Lite: league-relative value score, computed across ALL teams so it ranks fairly league-wide
  const lgWoba = computeLeagueWoba(qualHitters);
  const { lgERA, FIPconstant } = computeFipConstant(qualPitchers);
  const hitRowsWL = qualHitters.map(p => ({ ...p, warLite: computeHitterWarLite(p, lgWoba) }));
  const pitRowsWL = qualPitchers.map(p => ({ ...p, warLite: computePitcherWarLite(p, lgERA, FIPconstant) }));

  const sortRows = (rows, sort, cols) => {
    return [...rows].sort((a,b) => {
      const av = cols[sort.col]?.(a) ?? 0;
      const bv = cols[sort.col]?.(b) ?? 0;
      return sort.dir==="asc" ? av-bv : bv-av;
    });
  };

  const hitCols = {
    avg:  p => parseFloat(avg(p.stats.h||0, p.stats.ab||0)),
    obp:  p => parseFloat(avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0))),
    ab:   p => p.stats.ab||0,
    h:    p => p.stats.h||0,
    r:    p => p.stats.r||0,
    rbi:  p => p.stats.rbi||0,
    hr:   p => p.stats.hr||0,
    bb:   p => p.stats.bb||0,
    so:   p => p.stats.so||0,
    sb:   p => p.stats.sb||0,
    "2b": p => p.stats["2b"]||0,
    "3b": p => p.stats["3b"]||0,
    h:    p => p.stats.h||0,
    r:    p => p.stats.r||0,
    obp:  p => parseFloat(avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0))||0),
    gp:   p => p.games,
    warLite: p => p.warLite,
  };
  const pitCols = {
    warLite: p => p.warLite,
    era:  p => parseFloat(era(p.stats.er||0, p.stats.ip||0)),
    whip: p => parseFloat(whip(p.stats.bb||0, p.stats.h||0, p.stats.ip||0)),
    ip:   p => p.stats.ip||0,
    so:   p => p.stats.so||0,
    bb:   p => p.stats.bb||0,
    h:    p => p.stats.h||0,
    er:   p => p.stats.er||0,
    hr:   p => p.stats.hr||0,
    w:    p => p.stats.w||0,
    l:    p => p.stats.l||0,
    sv:   p => p.stats.sv||0,
    gp:   p => p.games,
  };

  const searchLc = search.trim().toLowerCase();
  const matchesSearch = (p) => !searchLc || p.name.toLowerCase().includes(searchLc) || p.team.toLowerCase().includes(searchLc);

  const sortedHitters  = sortRows(hitRowsWL, sortH, hitCols).filter(matchesSearch);
  const sortedPitchers = sortRows(pitRowsWL, sortP, pitCols).filter(matchesSearch);

  const ThH = ({label, col}) => <SortTh label={label} col={col} sort={sortH} setSort={setSortH} />;
  const ThP = ({label, col}) => <SortTh label={label} col={col} sort={sortP} setSort={setSortP} />;

  return (
    <div className="bg-white border border-stone-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-stone-800" style={{fontFamily:DISPLAY}}>All Players</h3>
          <p className="text-xs text-stone-400 mt-0.5">Qualified: ≥ 50% of league leader's AB</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs pointer-events-none">🔎</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search player or team…"
              className="text-xs pl-7 pr-3 py-1.5 rounded-lg border border-stone-200 focus:border-sky-400 focus:outline-none text-stone-700 w-44 sm:w-56" />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs">✕</button>
            )}
          </div>
          <button onClick={() => setLeagueOnly(v => !v)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${leagueOnly ? "bg-sky-600 text-white border-sky-600" : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"}`}>
            {leagueOnly ? "League Games" : "All Games"}
          </button>
          <div className="flex gap-1 bg-stone-100 p-1 rounded-xl">
            {["hitting","pitching"].map(v => (
              <button key={v} onClick={()=>setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${view===v?"bg-white text-stone-900 shadow-sm":"text-stone-500 hover:text-stone-700"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto" style={{maxHeight:"70vh", overflowY:"auto"}}>
        {view === "hitting" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100 sticky top-0 z-20">
                <th className="text-center px-3 py-3 text-xs font-bold text-stone-400 uppercase tracking-wider sticky left-0 bg-stone-50 w-8">#</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-stone-400 uppercase tracking-wider">Player</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-stone-400 uppercase tracking-wider">Team</th>
                <ThH label="GP" col="gp"/>
                <ThH label="AB" col="ab"/>
                <ThH label="AVG" col="avg"/>
                <ThH label="OBP" col="obp"/>
                <ThH label="H" col="h"/>
                <ThH label="R" col="r"/>
                <ThH label="RBI" col="rbi"/>
                <ThH label="HR" col="hr"/>
                <ThH label="2B" col="2b"/>
                <ThH label="BB" col="bb"/>
                <ThH label="K" col="so"/>
                <ThH label="SB" col="sb"/>
                <ThH label="WAR-Lite" col="warLite"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {sortedHitters.length === 0 && (
                <tr><td colSpan={16} className="text-center py-10 text-stone-400 text-sm">{searchLc ? "No hitters match your search." : "No qualified hitters yet. Players need at least 50% of the league leader's at bats."}</td></tr>
              )}
              {sortedHitters.map((p,i) => {
                const wl = p.warLite;
                const wlColor = wl > 0.5 ? "text-emerald-700" : wl > 0 ? "text-emerald-600" : wl > -0.5 ? "text-orange-500" : "text-red-600";
                return (
                <tr key={i} className="hover:bg-sky-50/40 transition-colors group">
                  <td className="px-3 py-3 text-center text-stone-400 font-semibold sticky left-0 bg-white group-hover:bg-sky-50/40 w-8" style={{fontFamily:MONO, fontSize:"0.78rem"}}>{i+1}</td>
                  <td className="px-4 py-3 bg-white group-hover:bg-sky-50/40 font-bold text-stone-800 whitespace-nowrap" style={{fontFamily:DISPLAY, fontSize:"0.85rem"}}>{p.name}{p.pos && <span className="text-stone-400 text-xs ml-1.5 font-normal">{p.pos}</span>}{p.grade && <span className="text-stone-400 text-xs ml-1 font-normal">{p.grade}</span>}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <TeamBadge name={p.team} size="xs" />
                      <button onClick={()=>onTeamClick(p.team)} className="text-xs text-sky-600 hover:text-sky-800 font-semibold transition-colors">{p.team}</button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-stone-500" style={{fontFamily:MONO}}>{p.games}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{p.stats.ab||0}</td>
                  <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{avg(p.stats.h||0,p.stats.ab||0)}</td>
                  <td className="px-3 py-3 text-center font-semibold text-sky-700" style={{fontFamily:MONO}}>{avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0))}</td>
                  {["h","r","rbi","hr","2b","bb","so","sb"].map(k=>(
                    <td key={k} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{p.stats[k]||0}</td>
                  ))}
                  <td className={"px-3 py-3 text-center font-black " + wlColor} style={{fontFamily:MONO}}>{wl >= 0 ? "+" : ""}{wl.toFixed(2)}</td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
        {view === "pitching" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100 sticky top-0 z-20">
                <th className="text-center px-3 py-3 text-xs font-bold text-stone-400 uppercase tracking-wider sticky left-0 bg-stone-50 w-8">#</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-stone-400 uppercase tracking-wider">Pitcher</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-stone-400 uppercase tracking-wider">Team</th>
                <ThP label="GP" col="gp"/>
                <ThP label="IP" col="ip"/>
                <ThP label="ERA" col="era"/>
                <ThP label="WHIP" col="whip"/>
                <ThP label="K" col="so"/>
                <ThP label="BB" col="bb"/>
                <ThP label="H" col="h"/>
                <ThP label="ER" col="er"/>
                <ThP label="HR" col="hr"/>
                <ThP label="W" col="w"/>
                <ThP label="L" col="l"/>
                <ThP label="SV" col="sv"/>
                <ThP label="WAR-Lite" col="warLite"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {sortedPitchers.length === 0 && (
                <tr><td colSpan={15} className="text-center py-10 text-stone-400 text-sm">{searchLc ? "No pitchers match your search." : "No qualified pitchers yet. Players need to appear in ≥ 50% of their team's games."}</td></tr>
              )}
              {sortedPitchers.map((p,i) => {
                const wl = p.warLite;
                const wlColor = wl > 0.5 ? "text-emerald-700" : wl > 0 ? "text-emerald-600" : wl > -0.5 ? "text-orange-500" : "text-red-600";
                return (
                <tr key={i} className="hover:bg-sky-50/40 transition-colors group">
                  <td className="px-3 py-3 text-center text-stone-400 font-semibold sticky left-0 bg-white group-hover:bg-sky-50/40 w-8" style={{fontFamily:MONO, fontSize:"0.78rem"}}>{i+1}</td>
                  <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-sky-50/40 font-bold text-stone-800 whitespace-nowrap" style={{fontFamily:DISPLAY, fontSize:"0.85rem"}}>
                    {p.name}
                    {p.grade && <span className="text-stone-400 text-xs ml-1.5 font-normal">{p.grade}</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <TeamBadge name={p.team} size="xs" />
                      <button onClick={()=>onTeamClick(p.team)} className="text-xs text-sky-600 hover:text-sky-800 font-semibold transition-colors">{p.team}</button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-stone-500" style={{fontFamily:MONO}}>{p.games}</td>
                  <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{p.stats.ip||0}</td>
                  <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{era(p.stats.er||0,p.stats.ip||0)}</td>
                  <td className="px-3 py-3 text-center font-semibold text-sky-700" style={{fontFamily:MONO}}>{whip(p.stats.bb||0,p.stats.h||0,p.stats.ip||0)}</td>
                  {["so","bb","h","er","hr","w","l","sv"].map(k=>(
                    <td key={k} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{p.stats[k]||0}</td>
                  ))}
                  <td className={"px-3 py-3 text-center font-black " + wlColor} style={{fontFamily:MONO}}>{wl >= 0 ? "+" : ""}{wl.toFixed(2)}</td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Standings Page ─────────────────────────────────────────────────────────────

// ── Player Name Correction Modal ─────────────────────────────────────────────
function RosterGradeModal({ team, onClose, onSave }) {
  const { useState } = React;
  const GRADES = ["Fr.", "So.", "Jr.", "Sr."];
  const playerNames = [...new Set([
    ...team.games.flatMap(g => (g.hitters||[]).map(p => p.name)),
    ...team.games.flatMap(g => (g.pitchers||[]).map(p => p.name)),
  ].filter(Boolean))].sort();
  const [roster, setRoster] = useState(() => ({ ...(team.roster || {}) }));
  const setGrade = (name, grade) => setRoster(prev => ({ ...prev, [name]: grade === "" ? undefined : grade }));
  const handleSave = () => { onSave(roster); onClose(); };
  return (
    <ModalShell title="Player Grades" onClose={onClose}>
      <div className="space-y-1 p-1 max-h-96 overflow-y-auto">
        {playerNames.length === 0 && (
          <p className="text-stone-400 text-sm text-center py-6">No players found. Upload game stats first.</p>
        )}
        {playerNames.map(name => (
          <div key={name} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-stone-50">
            <span className="text-sm text-stone-800 font-medium">{name}</span>
            <select value={roster[name] || ""} onChange={e => setGrade(name, e.target.value)}
              className="bg-stone-100 border border-stone-200 rounded px-2 py-1 text-xs text-stone-700 ml-3">
              <option value="">—</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        ))}
      </div>
      {playerNames.length > 0 && (
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-stone-200 text-stone-600 text-sm font-semibold hover:bg-stone-50 transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">Save Grades</button>
        </div>
      )}
    </ModalShell>
  );
}

function PlayerRenameModal({ teams, onClose, onRename }) {
  const { useState } = React;
  const [teamName, setTeamName] = useState("");
  const [wrongName, setWrongName] = useState("");
  const [rightName, setRightName] = useState("");
  const [preview, setPreview] = useState(null);

  const selectedTeam = teams.find(t => t.name === teamName);

  // Get all unique player names for the selected team
  const playerNames = selectedTeam ? [...new Set([
    ...selectedTeam.games.flatMap(g => (g.hitters||[]).map(p => p.name)),
    ...selectedTeam.games.flatMap(g => (g.pitchers||[]).map(p => p.name)),
  ].filter(Boolean))].sort() : [];

  const handlePreview = () => {
    if (!selectedTeam || !wrongName || !rightName) return;
    const hitCount = selectedTeam.games.reduce((n, g) => n + (g.hitters||[]).filter(p => p.name === wrongName).length, 0);
    const pitCount = selectedTeam.games.reduce((n, g) => n + (g.pitchers||[]).filter(p => p.name === wrongName).length, 0);
    setPreview({ hitCount, pitCount });
  };

  const handleApply = () => {
    if (!selectedTeam || !wrongName || !rightName) return;
    onRename(teamName, wrongName, rightName);
    onClose();
  };

  return (
    <ModalShell title="Fix Player Name" onClose={onClose}>
      <div className="space-y-4 p-1">
        <div>
          <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1">Team</label>
          <select value={teamName} onChange={e => { setTeamName(e.target.value); setWrongName(""); setPreview(null); }}
            className="w-full bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800">
            <option value="">Select a team...</option>
            {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        {teamName && (
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1">Wrong Name (to fix)</label>
            <select value={wrongName} onChange={e => { setWrongName(e.target.value); setPreview(null); }}
              className="w-full bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800">
              <option value="">Select player name...</option>
              {playerNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        {wrongName && (
          <div>
            <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1">Correct Name</label>
            <input value={rightName} onChange={e => { setRightName(e.target.value); setPreview(null); }}
              placeholder="Type the correct name..."
              className="w-full bg-stone-100 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800" />
          </div>
        )}
        {wrongName && rightName && !preview && (
          <button onClick={handlePreview}
            className="w-full py-2.5 rounded-lg bg-stone-800 text-white text-sm font-semibold hover:bg-stone-700 transition-colors">
            Preview Changes
          </button>
        )}
        {preview && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
            <p className="text-sm font-semibold text-amber-800">Will rename "{wrongName}" → "{rightName}"</p>
            <p className="text-xs text-amber-600">{preview.hitCount} hitting row{preview.hitCount !== 1 ? "s" : ""} · {preview.pitCount} pitching row{preview.pitCount !== 1 ? "s" : ""}</p>
          </div>
        )}
        {preview && (
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-stone-200 text-stone-600 text-sm font-semibold hover:bg-stone-50 transition-colors">Cancel</button>
            <button onClick={handleApply} className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">Apply Fix</button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function StandingsPage({ teams, onTeamClick, onUploadTeams, onUploadSchedule, onUploadStats, onFixPlayerName, dbStatus, dbError, scoutingTeams, onScoutAddGame, onScoutDeleteGame, onScoutRenamePlayer, onScoutDeletePlayer }) {
  const [tab, setTab] = useState("home");
  const todayStrInit = today();
  const [viewDate, setViewDate] = useState(todayStrInit);

  const addDays = (dateStr, n) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m-1, d+n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`;
  };

  const sorted = [...teams].sort((a,b) => {
    const wa = a.wins+a.losses===0?0:a.wins/(a.wins+a.losses);
    const wb = b.wins+b.losses===0?0:b.wins/(b.wins+b.losses);
    return wb-wa;
  });
  const leader = sorted[0];
  const todayStr = today();
  const nextGames = teams.flatMap(t => t.schedule.filter(g => !g.result && g.date && g.date >= todayStr).map(g => ({ ...g, teamName: t.name })))
    .sort((a,b) => a.date.localeCompare(b.date)).slice(0, 6);

  const [standSort, setStandSort] = useState({ col:"pct", dir:"desc" });
  // Compute live hitting/pitching from games for a team
  const liveHit = t => { const h={ab:0,h:0,r:0,hr:0,bb:0}; t.games.filter(g=>g.type!=="rainout").forEach(g=>(g.hitters||[]).forEach(p=>{h.ab+=toInt(p.ab);h.h+=toInt(p.h);h.r+=toInt(p.r);h.hr+=toInt(p.hr);h.bb+=toInt(p.bb);})); return h; };
  const livePit = t => { const p={er:0,ip:0,bb:0,h:0}; t.games.filter(g=>g.type!=="rainout").forEach(g=>(g.pitchers||[]).forEach(pi=>{p.er+=toInt(pi.er);p.ip=outsToIp(ipToOuts(p.ip)+ipToOuts(pi.ip||0));p.bb+=toInt(pi.bb);p.h+=toInt(pi.h);})); return p; };

  const standCols = {
    pct:   t => t.wins+t.losses===0?0:t.wins/(t.wins+t.losses),
    wins:  t => t.wins,
    losses:t => t.losses,
    avg:   t => { const h=liveHit(t); return parseFloat(avg(h.h,h.ab)||0); },
    era:   t => { const p=livePit(t); return parseFloat(era(p.er,p.ip)); },
    r:     t => liveHit(t).r,
    hr:    t => liveHit(t).hr,
  };
  const standSorted = [...teams].sort((a,b) => {
    const fn = standCols[standSort.col] || standCols.pct;
    const asc = standSort.dir==="asc";
    const diff = asc ? fn(a)-fn(b) : fn(b)-fn(a);
    if (diff !== 0) return diff;
    // Tiebreak: more wins is better, then fewer losses
    if (standSort.col === "pct") return (b.wins - a.wins) || (a.losses - b.losses);
    return 0;
  });
  const standLeader = [...teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)))[0];
  const ThS = ({label,col,cls=""}) => <SortTh label={label} col={col} sort={standSort} setSort={setStandSort} className={cls}/>;

  const TABS = ["home","leaderboards","team stats","all players","scouting","war-lite"];

  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("theme") === "dark"; } catch (e) { return false; }
  });
  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    try {
      document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch (e) {}
  };

  return (
    <div className="min-h-screen text-stone-800" style={{ fontFamily:BODY, backgroundColor:"var(--page-bg, #f2f2f0)" }}>
      <FontLink />

      {/* ── Top Bar ── */}
      <div style={{background:"#0a1628", position:"sticky", top:0, zIndex:50}}>
        {/* Top row: brand + hamburger */}
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between" style={{height:44}}>
          <div className="flex items-center gap-3">
            <div style={{width:3, height:20, background:"#e53e3e", borderRadius:2}} />
            <span className="text-white font-black text-xs uppercase" style={{fontFamily:DISPLAY, letterSpacing:"0.1em"}}>Seattle Metro Baseball</span>
            {/* Sync status indicator */}
            {dbStatus === "loading" && <span className="text-xs text-white/50 flex items-center gap-1"><span style={{width:6,height:6,borderRadius:"50%",background:"#60a5fa",display:"inline-block",animation:"pulse 1s infinite"}}/>Loading...</span>}
            {dbStatus === "saving"  && <span className="text-xs text-white/50 flex items-center gap-1"><span style={{width:6,height:6,borderRadius:"50%",background:"#fbbf24",display:"inline-block"}}/>Saving...</span>}
            {dbStatus === "saved"   && supabaseConfigured?.() && <span className="text-xs text-white/40 flex items-center gap-1"><span style={{width:6,height:6,borderRadius:"50%",background:"#34d399",display:"inline-block"}}/>Saved</span>}
            {dbStatus === "error"   && <span className="text-xs text-red-400 flex items-center gap-1" title={dbError}><span style={{width:6,height:6,borderRadius:"50%",background:"#f87171",display:"inline-block"}}/>Offline</span>}
          </div>
          <div className="flex items-center gap-1">
            {/* Dark mode toggle */}
            <button onClick={toggleDarkMode}
              className="flex items-center justify-center w-9 h-9 rounded transition-colors hover:bg-white/10 text-base"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            {/* Hamburger */}
            <div className="relative">
              <button onClick={() => setMenuOpen(m => !m)}
                className="flex flex-col justify-center items-center gap-1.5 w-9 h-9 rounded transition-colors hover:bg-white/10"
                aria-label="Menu">
                <span style={{display:"block",width:18,height:2,background:"white",borderRadius:2,transition:"all 0.2s",transform:menuOpen?"rotate(45deg) translate(3px,3px)":"none"}}/>
                <span style={{display:"block",width:18,height:2,background:"white",borderRadius:2,transition:"all 0.2s",opacity:menuOpen?0:1}}/>
                <span style={{display:"block",width:18,height:2,background:"white",borderRadius:2,transition:"all 0.2s",transform:menuOpen?"rotate(-45deg) translate(3px,-3px)":"none"}}/>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-stone-100 overflow-hidden w-52 z-50"
                  style={{boxShadow:"0 20px 60px rgba(0,0,0,0.18)"}}>
                  <div className="px-4 py-2 border-b border-stone-100">
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Manage League</p>
                </div>
                {[
                  { label:"Add Teams", action: onUploadTeams },
                  { label:"Enter Schedule", action: onUploadSchedule },
                  { label:"Upload Game Stats", action: onUploadStats, highlight: true },
                  { label:"Fix Player Name", action: onFixPlayerName },
                ].map(({label, action, highlight}) => (
                  <button key={label} onClick={() => { action(); setMenuOpen(false); }}
                    className={`w-full text-left px-4 py-3 text-sm font-semibold transition-colors flex items-center justify-between group ${highlight ? "text-red-600 hover:bg-red-50" : "text-stone-700 hover:bg-stone-50"}`}>
                    {label}
                    <span className="text-stone-300 group-hover:text-stone-400 transition-colors">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>
        {/* Tab row — always visible */}
        <div style={{borderTop:"1px solid rgba(255,255,255,0.1)", display:"flex", overflowX:"auto"}}>
          {TABS.map(t => (
            <button key={t} onClick={()=>setTab(t)}
              style={{
                flex:1,
                padding:"10px 8px",
                fontSize:"11px",
                fontWeight:800,
                fontFamily: BODY,
                textTransform:"uppercase",
                letterSpacing:"0.1em",
                whiteSpace:"nowrap",
                border:"none",
                background:"transparent",
                color: tab===t ? "#ffffff" : "rgba(255,255,255,0.45)",
                borderBottom: tab===t ? "3px solid #e53e3e" : "3px solid transparent",
                cursor:"pointer",
                transition:"all 0.15s",
              }}>
              {t === "home" ? "Home" : t === "leaderboards" ? "Leaders" : t === "team stats" ? "Teams" : t === "all players" ? "Players" : t === "scouting" ? "Scouting" : "WAR-Lite"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hero Photo ── */}
      <div className="relative overflow-hidden" style={{background:"#0a1628", height:220}}>
        <div style={{position:"absolute", top:0, left:0, right:0, height:112}}>
          <TeamLogoWall />
        </div>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom, rgba(8,18,38,0.1) 0%, rgba(8,18,38,0.55) 58%, rgba(8,18,38,0.95) 100%)"}} />
        <div className="relative max-w-6xl mx-auto px-6 h-full flex flex-col justify-end pb-5">
          <p className="text-red-400 text-xs font-black uppercase tracking-[0.3em] mb-1" style={{fontFamily:BODY}}>2026 Season</p>
          <h1 className="text-white whitespace-nowrap" style={{fontFamily:DISPLAY, fontSize:"clamp(1.1rem,3.4vw,2.3rem)", fontWeight:900, letterSpacing:"-0.02em", textShadow:"0 2px 20px rgba(0,0,0,0.9)"}}>
            Seattle Metro <span style={{color:"#93c5fd"}}>League Baseball</span>
          </h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* ── STANDINGS TAB ── */}
        {tab === "home" && (() => {
          // Build the 3 visible dates starting from viewDate
          const visibleDates = [viewDate, addDays(viewDate,1), addDays(viewDate,2)];

          // All games deduplicated — when both teams are in the league, only show once
          const seenMatchups = new Set();
          const allGames = teams.flatMap(t =>
            t.schedule.map((g, si) => ({ ...g, teamName: t.name, schedIdx: si }))
              .filter(g => g.date && g.type !== "rainout")
          ).sort((a, b) => a.date.localeCompare(b.date) || (a.time||"").localeCompare(b.time||""))
          .filter(g => {
            const key = [g.date, g.time||"", ...[g.teamName, g.opponent].sort()].join("|");
            if (seenMatchups.has(key)) return false;
            seenMatchups.add(key);
            return true;
          });

          const grouped = allGames.reduce((acc, g) => {
            if (!acc[g.date]) acc[g.date] = [];
            acc[g.date].push(g);
            return acc;
          }, {});

          const fmtDayHeader = (d) => {
            const [y, m, day] = d.split("-").map(Number);
            const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
            const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const dow = DAYS[new Date(Date.UTC(y, m-1, day)).getUTCDay()];
            return { dow, short: `${MONTHS[m-1]} ${day}`, full: `${dow}, ${MONTHS[m-1]} ${day}, ${y}` };
          };

          const fmtNav = (d) => {
            const [y, m, day] = d.split("-").map(Number);
            const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const dow = DAYS[new Date(Date.UTC(y, m-1, day)).getUTCDay()];
            return `${dow}, ${MONTHS[m-1]} ${day}, ${y}`;
          };

          const isToday = viewDate === todayStr;

          return (
            <div style={{display:"flex", gap:16, alignItems:"flex-start"}}>
              {/* LEFT: Schedule with date navigator */}
              <div style={{flex:"0 0 63%", minWidth:0}}>
                {/* Date navigator header */}
                <div className="bg-white border border-stone-200 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b-2 border-stone-800">
                    <button onClick={() => setViewDate(addDays(viewDate,-1))}
                      className="w-8 h-8 flex items-center justify-center rounded hover:bg-stone-100 transition-colors text-stone-500 hover:text-stone-800 font-black text-lg">‹</button>
                    <div className="text-center">
                      <p className="text-sm font-black text-stone-800" style={{fontFamily:BODY}}>{fmtNav(viewDate)}</p>
                      {!isToday && (
                        <button onClick={() => setViewDate(todayStr)}
                          className="text-xs text-red-500 hover:text-red-700 font-bold transition-colors" style={{fontFamily:BODY}}>
                          ← Today
                        </button>
                      )}
                    </div>
                    <button onClick={() => setViewDate(addDays(viewDate,1))}
                      className="w-8 h-8 flex items-center justify-center rounded hover:bg-stone-100 transition-colors text-stone-500 hover:text-stone-800 font-black text-lg">›</button>
                  </div>

                  {/* Column headers */}
                  <div className="px-4 py-1 grid text-xs font-black uppercase text-stone-400 border-b border-stone-100 bg-stone-50"
                    style={{gridTemplateColumns:"1fr 1fr 80px", gap:8, letterSpacing:"0.08em", fontFamily:BODY}}>
                    <span>Home</span><span>Away / Opponent</span><span className="text-center">Time</span>
                  </div>

                  {/* 3 days of games */}
                  {visibleDates.map((dateKey, di) => {
                    const games = grouped[dateKey] || [];
                    const { full } = fmtDayHeader(dateKey);
                    const isThisToday = dateKey === todayStr;
                    return (
                      <div key={dateKey}>
                        {/* Day separator */}
                        <div className="px-4 py-1.5 border-b border-t border-stone-100 flex items-center gap-2"
                          style={{background: isThisToday ? "#0a1628" : di === 0 ? "var(--day-bg-a, #f0f0ee)" : "var(--day-bg-b, #f5f4f1)"}}>
                          <p className="text-xs font-black uppercase"
                            style={{fontFamily:BODY, letterSpacing:"0.09em", color: isThisToday ? "white" : "var(--day-text, #57534e)"}}>
                            {full}
                          </p>
                          {isThisToday && <span className="text-xs font-black text-red-400 uppercase tracking-wider">Today</span>}
                          {games.length === 0 && <span className="text-xs text-stone-300 ml-auto">No games</span>}
                        </div>

                        {games.length > 0 && games.map((g, i) => (
                          <div key={i} className="px-4 py-2.5 grid items-center border-b border-stone-50 hover:bg-stone-50 transition-colors"
                            style={{gridTemplateColumns:"1fr 1fr 80px", gap:8}}>
                            {/* Home/primary team */}
                            <button onClick={() => onTeamClick(g.teamName)} className="flex items-center gap-2 min-w-0 text-left hover:opacity-75 transition-opacity">
                              <TeamBadge name={g.teamName} size="sm" />
                              <span className="text-xs font-bold text-stone-800 truncate" style={{fontFamily:BODY}}>{g.teamName.replace(" (Seattle)","")}</span>
                            </button>
                            {/* Opponent */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs text-stone-400 font-semibold flex-shrink-0">{g.isHome?"vs":"@"}</span>
                              <TeamBadge name={g.opponent} size="sm" />
                              <span className="text-xs font-semibold text-stone-600 truncate" style={{fontFamily:BODY}}>{g.opponent.replace(" (Seattle)","")}</span>
                            </div>
                            {/* Time or Score */}
                            {g.result
                              ? <p className={`text-xs font-black text-center`} style={{fontFamily:MONO}}>
                                  <span className={g.result==="W"?"text-emerald-600":g.result==="L"?"text-red-500":"text-stone-400"}>{g.result}</span>
                                  <span className="text-stone-600"> {g.score}-{g.oppScore}</span>
                                </p>
                              : <p className="text-xs text-stone-500 text-center" style={{fontFamily:MONO}}>{g.time || "—"}</p>
                            }
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: Standings */}
              <div style={{flex:"0 0 calc(37% - 16px)", minWidth:0, position:"sticky", top:100}}>
                <div className="bg-white border border-stone-200 overflow-hidden">
                  <div className="px-4 py-2 border-b-2 border-stone-800">
                    <p className="text-xs font-black uppercase text-stone-800" style={{fontFamily:BODY, letterSpacing:"0.1em"}}>Standings</p>
                  </div>
                  <div className="bg-stone-50 border-b border-stone-100 px-3 py-1 grid text-xs font-black uppercase text-stone-400"
                    style={{gridTemplateColumns:"18px 1fr 26px 26px 42px 36px", gap:4, letterSpacing:"0.06em", fontFamily:BODY}}>
                    <span>#</span><span>Team</span><span className="text-center">W</span><span className="text-center">L</span><span className="text-right">PCT</span><span className="text-right">GB</span>
                  </div>
                  {standSorted.map((t, i) => {
                    const wp = t.wins+t.losses===0?0:t.wins/(t.wins+t.losses);
                    const pct = t.wins+t.losses===0?".000":wp.toFixed(3).replace(/^0/,"");
                    const leader = standSorted[0];
                    const gbVal = ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2;
                    const gb = gbVal <= 0 ? "—" : gbVal.toFixed(1);
                    const isFirst = i===0 && t.wins > 0;
                    return (
                      <div key={t.name}
                        className={`px-3 py-2 grid items-center border-b border-stone-50 cursor-pointer transition-colors ${isFirst?"bg-amber-50/50 hover:bg-amber-50":"hover:bg-sky-50"}`}
                        style={{gridTemplateColumns:"18px 1fr 26px 26px 42px 36px", gap:4}}
                        onClick={() => onTeamClick(t.name)}>
                        <span className="text-xs text-stone-400 font-bold" style={{fontFamily:MONO}}>{i+1}</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isFirst && <span className="text-amber-400 text-xs">👑</span>}
                          <TeamBadge name={t.name} size="sm" />
                          <span className="text-xs font-bold truncate text-stone-800" style={{fontFamily:BODY}}>{t.name.replace(" (Seattle)","").replace("Bishop ","")}</span>
                        </div>
                        <span className="text-xs text-center font-bold text-emerald-600" style={{fontFamily:MONO}}>{t.wins}</span>
                        <span className="text-xs text-center font-bold text-red-500" style={{fontFamily:MONO}}>{t.losses}</span>
                        <span className="text-xs text-right text-stone-600 font-semibold" style={{fontFamily:MONO}}>{pct}</span>
                        <span className="text-xs text-right text-stone-400" style={{fontFamily:MONO}}>{gb}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Team leaders mini cards */}
                {teams.some(t => t.games.some(g => (g.hitters||[]).length > 0)) && (
                  <div className="mt-3 bg-white border border-stone-200 overflow-hidden">
                    <div className="px-4 py-2 border-b-2 border-stone-800">
                      <p className="text-xs font-black uppercase text-stone-800" style={{fontFamily:BODY, letterSpacing:"0.1em"}}>Team Leaders</p>
                    </div>
                    {[
                      { label:"AVG", t:[...teams].sort((a,b)=>{const ah=liveHit(a),bh=liveHit(b);return(bh.h/(bh.ab||1))-(ah.h/(ah.ab||1));})[0], stat:(t)=>{const h=liveHit(t);return avg(h.h,h.ab);} },
                      { label:"ERA", t:[...teams].filter(t=>livePit(t).ip>0).sort((a,b)=>{const ap=livePit(a),bp=livePit(b);return(ap.er/(ap.ip||1))-(bp.er/(bp.ip||1));})[0], stat:(t)=>{const p=livePit(t);return era(p.er,p.ip);} },
                      { label:"HR",  t:[...teams].sort((a,b)=>liveHit(b).hr-liveHit(a).hr)[0], stat:(t)=>liveHit(t).hr },
                    ].filter(l=>l.t).map(({label,t,stat},key) => (
                      <div key={key} className="px-3 py-2.5 flex items-center justify-between border-b border-stone-50 hover:bg-stone-50 transition-colors cursor-pointer"
                        onClick={() => onTeamClick(t.name)}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase text-stone-400 w-8" style={{fontFamily:BODY, letterSpacing:"0.08em"}}>{label}</span>
                          <TeamBadge name={t.name} size="sm" />
                          <span className="text-xs font-bold text-stone-700 truncate" style={{fontFamily:BODY}}>{t.name.replace(" (Seattle)","").replace("Bishop ","")}</span>
                        </div>
                        <span className="text-sm font-black text-emerald-600" style={{fontFamily:MONO}}>{stat(t)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── LEADERBOARDS TAB ── */}
        {tab === "leaderboards" && <LeaderboardsPage teams={teams} onTeamClick={onTeamClick} />}

        {/* ── TEAM STATS TAB ── */}
        {tab === "team stats" && <TeamStatsPage teams={teams} onTeamClick={onTeamClick} />}

        {/* ── ALL PLAYERS TAB ── */}
        {tab === "all players" && <AllPlayersPage teams={teams} onTeamClick={onTeamClick} />}

        {/* ── SCOUTING TAB ── */}
        {tab === "scouting" && <ScoutingPage scoutingTeams={scoutingTeams} onAddGame={onScoutAddGame} onDeleteGame={onScoutDeleteGame} onRenamePlayer={onScoutRenamePlayer} onDeletePlayer={onScoutDeletePlayer} />}

        {/* ── WAR-LITE TAB ── */}
        {tab === "war-lite" && <WARLitePage teams={teams} onTeamClick={onTeamClick} />}

      </div>
    </div>
  );
}

// ── Scouting: localStorage helpers ───────────────────────────────────────────
const SCOUT_LS_KEY = "baseball_scouting_v1";
function scoutLsSave(data) { try { localStorage.setItem(SCOUT_LS_KEY, JSON.stringify(data)); } catch(e) {} }
function scoutLsLoad() { try { const r = localStorage.getItem(SCOUT_LS_KEY); return r ? JSON.parse(r) : []; } catch(e) { return []; } }

// ── Scouting: Add Game Modal ──────────────────────────────────────────────────
function ScoutAddGameModal({ onClose, onSave }) {
  const [teamName, setTeamName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(today());
  const [myScore, setMyScore] = useState("");
  const [oppScore, setOppScore] = useState("");
  const [hitImg, setHitImg] = useState(null);
  const [hitData, setHitData] = useState(null);
  const [hitLoading, setHitLoading] = useState(false);
  const [hitError, setHitError] = useState("");
  const [pitImg, setPitImg] = useState(null);
  const [pitData, setPitData] = useState(null);
  const [pitLoading, setPitLoading] = useState(false);
  const [pitError, setPitError] = useState("");
  const [step, setStep] = useState("info"); // info | upload | done

  const extractHitting = async () => {
    setHitLoading(true); setHitError("");
    try {
      const r = await extractPlayerStatsFromImage(hitImg.b64, hitImg.mediaType);
      if (!r.hitters || r.hitters.length === 0) setHitError("No hitters found. Try a clearer screenshot.");
      setHitData(r.hitters || []);
    } catch(e) { setHitError("Extraction failed: " + e.message); }
    setHitLoading(false);
  };
  const extractPitching = async () => {
    setPitLoading(true); setPitError("");
    try {
      const r = await extractPlayerStatsFromImage(pitImg.b64, pitImg.mediaType);
      if (!r.pitchers || r.pitchers.length === 0) setPitError("No pitchers found. Try a clearer screenshot.");
      setPitData(r.pitchers || []);
    } catch(e) { setPitError("Extraction failed: " + e.message); }
    setPitLoading(false);
  };

  const canSave = (hitData || pitData);
  const handleSave = () => {
    onSave({
      teamName: teamName.trim() || "Unknown Team",
      opponent: opponent.trim() || "Unknown Opponent",
      date,
      myScore: toInt(myScore),
      oppScore: toInt(oppScore),
      result: myScore !== "" && oppScore !== "" ? (toInt(myScore) > toInt(oppScore) ? "W" : toInt(myScore) < toInt(oppScore) ? "L" : "T") : undefined,
      hitters: hitData || [],
      pitchers: pitData || [],
    });
    setStep("done");
  };

  if (step === "done") return (
    <ModalShell title="✓ Scouting Game Saved" onClose={onClose}>
      <div className="text-center py-8 space-y-4">
        <div className="text-6xl">🔭</div>
        <p className="text-emerald-600 font-bold text-xl">Game logged!</p>
        <p className="text-stone-400 text-sm">{teamName} · {fmtDate(date)}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setStep("info"); setTeamName(""); setOpponent(""); setDate(today()); setMyScore(""); setOppScore(""); setHitImg(null); setHitData(null); setPitImg(null); setPitData(null); setHitError(""); setPitError(""); }}
            className="px-5 py-2 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">Add Another</button>
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors">Done</button>
        </div>
      </div>
    </ModalShell>
  );

  if (step === "info") return (
    <ModalShell title="Log Scouting Game" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1.5">Team Being Scouted</label>
          <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="e.g. Kennedy Catholic"
            className="w-full bg-stone-100 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 text-sm" />
        </div>
        <div>
          <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1.5">Opponent</label>
          <input value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="e.g. Bellevue"
            className="w-full bg-stone-100 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 text-sm" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-stone-100 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-800 text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-stone-400 uppercase tracking-wider font-semibold block mb-1.5">Score</label>
            <div className="flex items-center gap-2">
              <input value={myScore} onChange={e => setMyScore(e.target.value)} placeholder="Us" type="number" min="0"
                className="w-full bg-stone-100 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 text-sm text-center font-bold" />
              <span className="text-stone-400 font-bold">–</span>
              <input value={oppScore} onChange={e => setOppScore(e.target.value)} placeholder="Opp" type="number" min="0"
                className="w-full bg-stone-100 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-900 text-sm text-center font-bold" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">Cancel</button>
          <button onClick={() => setStep("upload")} disabled={!teamName.trim()}
            className="flex-1 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors disabled:opacity-40">
            Upload Stats →
          </button>
        </div>
      </div>
    </ModalShell>
  );

  // Step: upload screenshots
  return (
    <ModalShell title={`Stats — ${teamName || "Team"}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-stone-50 rounded-xl border border-stone-200 px-4 py-3">
          <p className="text-sm font-semibold text-stone-800">{teamName} <span className="text-stone-400">vs</span> {opponent}</p>
          <p className="text-xs text-stone-500">{fmtDate(date)}{myScore !== "" && oppScore !== "" ? ` · ${myScore}–${oppScore}` : ""}</p>
          <button onClick={() => setStep("info")} className="text-xs text-stone-400 hover:text-stone-800 mt-1">← Edit</button>
        </div>

        {/* Hitting */}
        <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-emerald-600 uppercase tracking-wider font-semibold">🏏 Hitting Stats</p>
            {hitData && <span className="text-xs text-emerald-600">{hitData.length} players ✓</span>}
          </div>
          {!hitImg ? (
            <ImageDropZone onFile={f => { setHitImg(f); setHitData(null); }} label="Drop hitting stats screenshot" />
          ) : (
            <div className="space-y-2">
              <img src={hitImg.preview} alt="hitting" className="w-full rounded-lg border border-stone-200 max-h-40 object-contain bg-stone-100" />
              {hitData ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-stone-400 border-b border-stone-200">
                      <th className="text-left py-1 pr-3">Player</th>
                      <th className="px-1 text-center">AB</th><th className="px-1 text-center">H</th><th className="px-1 text-center">R</th>
                      <th className="px-1 text-center">RBI</th><th className="px-1 text-center">HR</th><th className="px-1 text-center">BB</th><th className="px-1 text-center">K</th>
                    </tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {hitData.map((p,i) => (
                        <tr key={i} className="text-stone-600">
                          <td className="py-1 pr-3 font-semibold text-stone-900 whitespace-nowrap">{p.name} <span className="text-stone-400 font-normal">{p.pos}</span></td>
                          <td className="px-1 text-center font-mono">{p.ab}</td><td className="px-1 text-center font-mono">{p.h}</td>
                          <td className="px-1 text-center font-mono">{p.r}</td><td className="px-1 text-center font-mono">{p.rbi}</td>
                          <td className="px-1 text-center font-mono">{p.hr}</td><td className="px-1 text-center font-mono">{p.bb}</td>
                          <td className="px-1 text-center font-mono">{p.so}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setHitImg(null)} className="text-xs text-stone-400 hover:text-stone-900 px-2">✕</button>
                  <button onClick={extractHitting} disabled={hitLoading}
                    className="flex-1 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 text-sm font-semibold disabled:opacity-40">
                    {hitLoading ? "Extracting…" : "Extract with AI ✨"}
                  </button>
                </div>
              )}
              {hitError && <p className="text-red-600 text-xs">{hitError}</p>}
              {hitData && <button onClick={() => { setHitImg(null); setHitData(null); }} className="text-xs text-stone-400 hover:text-stone-900">↺ Re-upload</button>}
            </div>
          )}
        </div>

        {/* Pitching */}
        <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-indigo-600 uppercase tracking-wider font-semibold">⚡ Pitching Stats</p>
            {pitData && <span className="text-xs text-indigo-600">{pitData.length} pitchers ✓</span>}
          </div>
          {!pitImg ? (
            <ImageDropZone onFile={f => { setPitImg(f); setPitData(null); }} label="Drop pitching stats screenshot" />
          ) : (
            <div className="space-y-2">
              <img src={pitImg.preview} alt="pitching" className="w-full rounded-lg border border-stone-200 max-h-40 object-contain bg-stone-100" />
              {pitData ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-stone-400 border-b border-stone-200">
                      <th className="text-left py-1 pr-3">Pitcher</th>
                      <th className="px-1 text-center">IP</th><th className="px-1 text-center">H</th><th className="px-1 text-center">R</th>
                      <th className="px-1 text-center">ER</th><th className="px-1 text-center">BB</th><th className="px-1 text-center">K</th><th className="px-1 text-center">Dec</th>
                    </tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {pitData.map((p,i) => (
                        <tr key={i} className="text-stone-600">
                          <td className="py-1 pr-3 font-semibold text-stone-900 whitespace-nowrap">{p.name}</td>
                          <td className="px-1 text-center font-mono">{p.ip}</td><td className="px-1 text-center font-mono">{p.h}</td>
                          <td className="px-1 text-center font-mono">{p.r}</td><td className="px-1 text-center font-mono">{p.er}</td>
                          <td className="px-1 text-center font-mono">{p.bb}</td><td className="px-1 text-center font-mono">{p.so}</td>
                          <td className="px-1 text-center font-mono font-bold text-emerald-600">{p.dec}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setPitImg(null)} className="text-xs text-stone-400 hover:text-stone-900 px-2">✕</button>
                  <button onClick={extractPitching} disabled={pitLoading}
                    className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-stone-900 text-sm font-semibold disabled:opacity-40">
                    {pitLoading ? "Extracting…" : "Extract with AI ✨"}
                  </button>
                </div>
              )}
              {pitError && <p className="text-red-600 text-xs">{pitError}</p>}
              {pitData && <button onClick={() => { setPitImg(null); setPitData(null); }} className="text-xs text-stone-400 hover:text-stone-900">↺ Re-upload</button>}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={() => setStep("info")} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-white transition-colors">← Back</button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex-1 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-semibold transition-colors disabled:opacity-40">
            Save Game ✓
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Scouting: Team Detail View ────────────────────────────────────────────────
function ScoutTeamView({ teamName, games, onBack, onDelete, onRenamePlayer, onDeletePlayer }) {
  const [stab, setStab] = useState("hitting");
  const [sortH, setSortH] = useState({ col:"avg", dir:"desc" });
  const [sortP, setSortP] = useState({ col:"era", dir:"asc" });
  const [confirmDel, setConfirmDel] = useState(null);
  const [showManage, setShowManage] = useState(false);

  const allHitters  = mergePlayerStats(games, "hitters");
  const allPitchers = mergePlayerStats(games, "pitchers");

  const hitCols = {
    avg: p => parseFloat(avg(p.stats.h||0, p.stats.ab||0)),
    obp: p => parseFloat(avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0))),
    slg: p => parseFloat(slg(p.stats.h||0, p.stats["2b"]||0, p.stats["3b"]||0, p.stats.hr||0, p.stats.ab||0)),
    ops: p => {
      const obpV = avg((p.stats.h||0)+(p.stats.bb||0),(p.stats.ab||0)+(p.stats.bb||0));
      const slgV = slg(p.stats.h||0, p.stats["2b"]||0, p.stats["3b"]||0, p.stats.hr||0, p.stats.ab||0);
      return parseFloat(ops(obpV, slgV));
    },
    ab:p=>p.stats.ab||0, h:p=>p.stats.h||0, r:p=>p.stats.r||0,
    rbi:p=>p.stats.rbi||0, hr:p=>p.stats.hr||0, bb:p=>p.stats.bb||0, so:p=>p.stats.so||0, sb:p=>p.stats.sb||0,
  };
  const pitCols = {
    era:  p => parseFloat(era(p.stats.er||0, p.stats.ip||0)),
    whip: p => parseFloat(whip(p.stats.bb||0, p.stats.h||0, p.stats.ip||0)),
    ip:p=>ipToDecimal(p.stats.ip||0), so:p=>p.stats.so||0, bb:p=>p.stats.bb||0,
    h:p=>p.stats.h||0, er:p=>p.stats.er||0, hr:p=>p.stats.hr||0,
  };
  const sortedH = [...allHitters].sort((a,b) => {
    const av = hitCols[sortH.col]?.(a)??0, bv = hitCols[sortH.col]?.(b)??0;
    return sortH.dir==="asc" ? av-bv : bv-av;
  });
  const sortedP = [...allPitchers].sort((a,b) => {
    const av = pitCols[sortP.col]?.(a)??0, bv = pitCols[sortP.col]?.(b)??0;
    return sortP.dir==="asc" ? av-bv : bv-av;
  });

  const totH = allHitters.reduce((acc,p) => { ["ab","h","r","rbi","hr","bb","so","2b","3b","sb"].forEach(k=>{acc[k]=(acc[k]||0)+(p.stats[k]||0);}); return acc; }, {});
  const totP = allPitchers.reduce((acc,p) => { ["h","r","er","bb","so","hr"].forEach(k=>{acc[k]=(acc[k]||0)+(p.stats[k]||0);}); acc.ip=outsToIp(ipToOuts(acc.ip||0)+ipToOuts(p.stats.ip||0)); return acc; }, {});

  const ThH = ({label, col}) => <SortTh label={label} col={col} sort={sortH} setSort={setSortH} />;
  const ThP = ({label, col}) => <SortTh label={label} col={col} sort={sortP} setSort={setSortP} />;

  return (
    <div>
      {/* Header */}
      <div className="bg-white border border-stone-200 mb-4 overflow-hidden">
        <div className="px-6 py-4 flex items-center gap-4 border-b border-stone-100">
          <button onClick={onBack} className="text-stone-400 hover:text-stone-800 transition-colors font-bold text-lg">←</button>
          <div className="flex-1">
            <h2 className="font-black text-xl text-stone-900" style={{fontFamily:DISPLAY}}>{teamName}</h2>
            <p className="text-xs text-stone-400 mt-0.5">{games.length} game{games.length!==1?"s":""} scouted</p>
          </div>
          <button onClick={() => setShowManage(true)}
            className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 text-xs font-bold uppercase tracking-wider hover:bg-stone-50 hover:text-stone-800 transition-colors">
            ✎ Manage Players
          </button>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-stone-100">
          {["hitting","pitching","game log"].map(t => (
            <button key={t} onClick={() => setStab(t)}
              className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${stab===t?"border-b-2 border-red-500 text-stone-900":"text-stone-400 hover:text-stone-700"}`}
              style={{fontFamily:BODY, letterSpacing:"0.09em"}}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* HITTING */}
      {stab === "hitting" && (
        <div className="bg-white border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h3 className="font-bold text-lg text-stone-900" style={{fontFamily:DISPLAY}}>Season Hitting — {teamName}</h3>
          </div>
          {sortedH.length === 0 ? (
            <div className="text-center py-12 text-stone-400">No hitting stats yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                    <th className="text-left px-4 py-3 sticky left-0 bg-stone-50" style={{fontFamily:BODY}}>Player</th>
                    <ThH label="AB" col="ab"/><ThH label="H" col="h"/>
                    <ThH label="AVG" col="avg"/><ThH label="R" col="r"/>
                    <ThH label="RBI" col="rbi"/><ThH label="HR" col="hr"/>
                    <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">2B</th>
                    <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">3B</th>
                    <ThH label="BB" col="bb"/><ThH label="K" col="so"/>
                    <ThH label="SB" col="sb"/><ThH label="OBP" col="obp"/>
                    <ThH label="SLG" col="slg"/><ThH label="OPS" col="ops"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {sortedH.map((p,i) => {
                    const s = p.stats;
                    return (
                      <tr key={i} className="hover:bg-sky-50/40 transition-colors">
                        <td className="px-4 py-3 sticky left-0 bg-white hover:bg-sky-50/40">
                          <span className="font-semibold text-stone-800" style={{fontFamily:DISPLAY, fontSize:"0.85rem"}}>{p.name}</span>
                          {p.pos && <span className="text-stone-400 text-xs ml-1.5">{p.pos}</span>}
                        </td>
                        {[s.ab||0, s.h||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{v}</td>)}
                        <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{avg(s.h||0,s.ab||0)}</td>
                        {[s.r||0,s.rbi||0,s.hr||0,s["2b"]||0,s["3b"]||0,s.bb||0,s.so||0,s.sb||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{v}</td>)}
                        <td className="px-3 py-3 text-center font-semibold text-sky-700" style={{fontFamily:MONO}}>{avg((s.h||0)+(s.bb||0),(s.ab||0)+(s.bb||0))}</td>
                        <td className="px-3 py-3 text-center font-semibold text-indigo-700" style={{fontFamily:MONO}}>{slg(s.h||0,s["2b"]||0,s["3b"]||0,s.hr||0,s.ab||0)}</td>
                        <td className="px-3 py-3 text-center font-bold text-stone-800" style={{fontFamily:MONO}}>{ops(avg((s.h||0)+(s.bb||0),(s.ab||0)+(s.bb||0)), slg(s.h||0,s["2b"]||0,s["3b"]||0,s.hr||0,s.ab||0))}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-stone-300 bg-stone-50 font-bold">
                    <td className="px-4 py-3 sticky left-0 bg-stone-50 text-xs uppercase tracking-wider text-stone-500">Totals</td>
                    {[totH.ab||0, totH.h||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{v}</td>)}
                    <td className="px-3 py-3 text-center text-emerald-700" style={{fontFamily:MONO}}>{avg(totH.h||0,totH.ab||0)}</td>
                    {[totH.r||0,totH.rbi||0,totH.hr||0,totH["2b"]||0,totH["3b"]||0,totH.bb||0,totH.so||0,totH.sb||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{v}</td>)}
                    <td className="px-3 py-3 text-center text-sky-700" style={{fontFamily:MONO}}>{avg((totH.h||0)+(totH.bb||0),(totH.ab||0)+(totH.bb||0))}</td>
                    <td className="px-3 py-3 text-center text-indigo-700" style={{fontFamily:MONO}}>{slg(totH.h||0,totH["2b"]||0,totH["3b"]||0,totH.hr||0,totH.ab||0)}</td>
                    <td className="px-3 py-3 text-center text-stone-900" style={{fontFamily:MONO}}>{ops(avg((totH.h||0)+(totH.bb||0),(totH.ab||0)+(totH.bb||0)), slg(totH.h||0,totH["2b"]||0,totH["3b"]||0,totH.hr||0,totH.ab||0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PITCHING */}
      {stab === "pitching" && (
        <div className="bg-white border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h3 className="font-bold text-lg text-stone-900" style={{fontFamily:DISPLAY}}>Season Pitching — {teamName}</h3>
          </div>
          {sortedP.length === 0 ? (
            <div className="text-center py-12 text-stone-400">No pitching stats yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-stone-400 uppercase tracking-wider bg-stone-50">
                    <th className="text-left px-4 py-3 sticky left-0 bg-stone-50" style={{fontFamily:BODY}}>Pitcher</th>
                    <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">GP</th>
                    <ThP label="IP" col="ip"/><ThP label="ERA" col="era"/>
                    <ThP label="WHIP" col="whip"/><ThP label="H" col="h"/>
                    <ThP label="R" col="r"/><ThP label="ER" col="er"/>
                    <ThP label="BB" col="bb"/><ThP label="K" col="so"/>
                    <ThP label="HR" col="hr"/>
                    <th className="px-3 py-3 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">W-L-S</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {sortedP.map((p,i) => {
                    const s = p.stats;
                    const gp = games.filter(g => (g.pitchers||[]).some(x => x.name?.toLowerCase()===p.name?.toLowerCase())).length;
                    const dec = p.dec || "";
                    const w=(dec.match(/W/g)||[]).length, l=(dec.match(/L/g)||[]).length, sv=(dec.match(/S/g)||[]).length;
                    return (
                      <tr key={i} className="hover:bg-sky-50/40 transition-colors">
                        <td className="px-4 py-3 sticky left-0 bg-white hover:bg-sky-50/40 font-semibold text-stone-800" style={{fontFamily:DISPLAY, fontSize:"0.85rem"}}>{p.name}</td>
                        <td className="px-3 py-3 text-center text-stone-500" style={{fontFamily:MONO}}>{gp}</td>
                        <td className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{s.ip||0}</td>
                        <td className="px-3 py-3 text-center font-bold text-emerald-700" style={{fontFamily:MONO}}>{era(s.er||0,s.ip||0)}</td>
                        <td className="px-3 py-3 text-center text-sky-700 font-semibold" style={{fontFamily:MONO}}>{whip(s.bb||0,s.h||0,s.ip||0)}</td>
                        {[s.h||0,s.r||0,s.er||0,s.bb||0,s.so||0,s.hr||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-600" style={{fontFamily:MONO}}>{v}</td>)}
                        <td className="px-3 py-3 text-center text-stone-500 text-xs" style={{fontFamily:MONO}}>{w}-{l}-{sv}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-stone-300 bg-stone-50 font-bold">
                    <td className="px-4 py-3 sticky left-0 bg-stone-50 text-xs uppercase tracking-wider text-stone-500">Totals</td>
                    <td className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{games.length}</td>
                    <td className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{totP.ip||0}</td>
                    <td className="px-3 py-3 text-center text-emerald-700" style={{fontFamily:MONO}}>{era(totP.er||0,totP.ip||0)}</td>
                    <td className="px-3 py-3 text-center text-sky-700" style={{fontFamily:MONO}}>{whip(totP.bb||0,totP.h||0,totP.ip||0)}</td>
                    {[totP.h||0,totP.r||0,totP.er||0,totP.bb||0,totP.so||0,totP.hr||0].map((v,j)=><td key={j} className="px-3 py-3 text-center text-stone-800" style={{fontFamily:MONO}}>{v}</td>)}
                    <td className="px-3 py-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* GAME LOG */}
      {stab === "game log" && (
        <div className="bg-white border border-stone-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h3 className="font-bold text-lg text-stone-900" style={{fontFamily:DISPLAY}}>Game Log</h3>
          </div>
          {games.length === 0 ? (
            <div className="text-center py-12 text-stone-400">No games logged yet</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {[...games].map((g, rawIdx) => ({ g, rawIdx })).reverse().map(({ g, rawIdx }) => (
                <div key={rawIdx} className="px-6 py-4 hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <span className="text-stone-600 text-xs font-medium w-20 flex-shrink-0" style={{fontFamily:MONO}}>{fmtDate(g.date)}</span>
                    <span className="font-bold text-stone-800 flex-1" style={{fontFamily:DISPLAY}}>vs {g.opponent}</span>
                    {g.result && (
                      <span className={`font-bold text-lg ${g.result==="W"?"text-emerald-600":g.result==="L"?"text-red-600":"text-stone-500"}`} style={{fontFamily:MONO}}>
                        {g.result} {g.myScore}–{g.oppScore}
                      </span>
                    )}
                    <div className="ml-auto">
                      {confirmDel === rawIdx ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone-500">Delete?</span>
                          <button onClick={() => { onDelete(rawIdx); setConfirmDel(null); }}
                            className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors">Yes</button>
                          <button onClick={() => setConfirmDel(null)}
                            className="text-xs px-2 py-1 rounded bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDel(rawIdx)}
                          className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">🗑</button>
                      )}
                    </div>
                  </div>
                  {(g.hitters||[]).length > 0 && (
                    <div className="mt-1 overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead><tr className="text-stone-400 border-b border-stone-100">
                          <th className="text-left py-1 pr-3">Hitter</th>
                          {["AB","H","R","RBI","HR","BB","K"].map(h=><th key={h} className="px-2 text-center">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {g.hitters.map((p,j) => (
                            <tr key={j} className="text-stone-500 hover:text-stone-800 transition-colors">
                              <td className="py-0.5 pr-3 text-stone-700 font-medium">{p.name} <span className="text-stone-400">{p.pos}</span></td>
                              {[p.ab,p.h,p.r,p.rbi,p.hr,p.bb,p.so].map((v,k)=><td key={k} className="px-2 text-center" style={{fontFamily:MONO}}>{v}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(g.pitchers||[]).length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead><tr className="text-stone-400 border-b border-stone-100">
                          <th className="text-left py-1 pr-3">Pitcher</th>
                          {["IP","H","R","ER","BB","K","Dec"].map(h=><th key={h} className="px-2 text-center">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {g.pitchers.map((p,j) => (
                            <tr key={j} className="text-stone-500 hover:text-stone-800 transition-colors">
                              <td className="py-0.5 pr-3 text-stone-700 font-medium">{p.name}</td>
                              {[p.ip,p.h,p.r,p.er,p.bb,p.so].map((v,k)=><td key={k} className="px-2 text-center" style={{fontFamily:MONO}}>{v}</td>)}
                              <td className="px-2 text-center font-bold text-emerald-600" style={{fontFamily:MONO}}>{p.dec}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showManage && (
        <ScoutPlayerManageModal
          teamName={teamName}
          games={games}
          onClose={() => setShowManage(false)}
          onRename={onRenamePlayer}
          onDeletePlayer={onDeletePlayer}
        />
      )}
    </div>
  );
}

// ── Scouting: Manage Players Modal (rename / delete) ──────────────────────────
function ScoutPlayerManageModal({ teamName, games, onClose, onRename, onDeletePlayer }) {
  const { useState } = React;
  const allNames = [...new Set([
    ...games.flatMap(g => (g.hitters||[]).map(p => p.name)),
    ...games.flatMap(g => (g.pitchers||[]).map(p => p.name)),
  ].filter(Boolean))].sort();

  const [edits, setEdits] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);

  const countsFor = (name) => {
    const hitCount = games.reduce((n,g) => n + (g.hitters||[]).filter(p => p.name === name).length, 0);
    const pitCount = games.reduce((n,g) => n + (g.pitchers||[]).filter(p => p.name === name).length, 0);
    return { hitCount, pitCount };
  };

  const startEdit = (name) => setEdits(s => ({ ...s, [name]: name }));
  const cancelEdit = (name) => setEdits(s => { const c = { ...s }; delete c[name]; return c; });

  const handleSave = (oldName) => {
    const newName = (edits[oldName] || "").trim();
    if (newName && newName !== oldName) onRename(teamName, oldName, newName);
    cancelEdit(oldName);
  };

  return (
    <ModalShell title={`Manage Players — ${teamName}`} onClose={onClose}>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto p-1">
        {allNames.length === 0 ? (
          <p className="text-stone-400 text-sm text-center py-8">No players logged for this team yet.</p>
        ) : allNames.map(name => {
          const { hitCount, pitCount } = countsFor(name);
          const editing = edits[name] !== undefined;
          return (
            <div key={name} className="flex items-center gap-2 border border-stone-100 rounded-lg px-3 py-2">
              {editing ? (
                <input autoFocus value={edits[name]}
                  onChange={e => setEdits(s => ({ ...s, [name]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") handleSave(name); if (e.key === "Escape") cancelEdit(name); }}
                  className="flex-1 bg-stone-100 border border-stone-200 rounded px-2 py-1 text-sm text-stone-800" />
              ) : (
                <span className="flex-1 min-w-0 font-semibold text-stone-800 text-sm" style={{fontFamily:DISPLAY}}>
                  {name}
                  <span className="text-stone-400 text-xs ml-2 font-normal" style={{fontFamily:BODY}}>
                    {hitCount > 0 ? `${hitCount} hitting row${hitCount!==1?"s":""}` : ""}
                    {hitCount > 0 && pitCount > 0 ? " · " : ""}
                    {pitCount > 0 ? `${pitCount} pitching row${pitCount!==1?"s":""}` : ""}
                  </span>
                </span>
              )}

              {editing ? (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => handleSave(name)} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors">Save</button>
                  <button onClick={() => cancelEdit(name)} className="text-xs px-2 py-1 rounded bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors">Cancel</button>
                </div>
              ) : confirmDel === name ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-stone-500">Delete?</span>
                  <button onClick={() => { onDeletePlayer(teamName, name); setConfirmDel(null); }}
                    className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors">Yes</button>
                  <button onClick={() => setConfirmDel(null)} className="text-xs px-2 py-1 rounded bg-stone-200 text-stone-600 hover:bg-stone-300 transition-colors">No</button>
                </div>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => startEdit(name)} className="text-xs px-2 py-1 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-800 transition-colors">✎ Rename</button>
                  <button onClick={() => setConfirmDel(name)} className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">🗑</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-stone-400 mt-3 px-1">Renaming to a name that already exists will merge their stats together.</p>
    </ModalShell>
  );
}
function ScoutingPage({ scoutingTeams, onAddGame, onDeleteGame, onRenamePlayer, onDeletePlayer }) {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  // Group games by team name
  const teamMap = {};
  scoutingTeams.forEach((g, i) => {
    const key = g.teamName;
    if (!teamMap[key]) teamMap[key] = { name: key, games: [] };
    teamMap[key].games.push({ ...g, _globalIdx: i });
  });
  const teamList = Object.values(teamMap).sort((a,b) => a.name.localeCompare(b.name));

  const handleDelete = (globalIdx) => {
    onDeleteGame(globalIdx);
    // If this was the last game for the selected team, go back
    const remaining = scoutingTeams.filter((_,i) => i !== globalIdx && _.teamName === selectedTeam);
    if (remaining.length === 0) setSelectedTeam(null);
  };

  if (selectedTeam) {
    const entry = teamMap[selectedTeam];
    if (!entry) { setSelectedTeam(null); return null; }
    return (
      <div>
        <ScoutTeamView
          teamName={selectedTeam}
          games={entry.games}
          onBack={() => setSelectedTeam(null)}
          onDelete={(rawIdx) => {
            // rawIdx is already the original forward-order index within entry.games
            // (ScoutTeamView reverses only the display order, not the index values)
            const g = entry.games[rawIdx];
            handleDelete(g._globalIdx);
          }}
          onRenamePlayer={onRenamePlayer}
          onDeletePlayer={onDeletePlayer}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-stone-100">
          <div>
            <h2 className="font-black text-xl text-stone-900" style={{fontFamily:DISPLAY}}>🔭 Scouting</h2>
            <p className="text-xs text-stone-400 mt-0.5">Opponent team stats — outside Metro League</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 text-sm font-bold transition-colors">
            + Log Game
          </button>
        </div>

        {teamList.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-5xl">🔭</div>
            <p className="text-stone-500 font-semibold">No scouting data yet</p>
            <p className="text-stone-400 text-sm">Log a game to start tracking opponent stats.</p>
            <button onClick={() => setShowAdd(true)}
              className="mt-2 px-5 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-stone-900 font-bold text-sm transition-colors">
              Log First Game →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {teamList.map(t => {
              const gp = t.games.length;
              const allH = mergePlayerStats(t.games, "hitters");
              const allP = mergePlayerStats(t.games, "pitchers");
              const totH = allH.reduce((a,p)=>{a.ab=(a.ab||0)+(p.stats.ab||0);a.h=(a.h||0)+(p.stats.h||0);a.bb=(a.bb||0)+(p.stats.bb||0);return a;},{});
              const totP = allP.reduce((a,p)=>{a.er=(a.er||0)+(p.stats.er||0);a.ip=outsToIp(ipToOuts(a.ip||0)+ipToOuts(p.stats.ip||0));return a;},{});
              const teamAvg = avg(totH.h||0, totH.ab||0);
              const teamEra = era(totP.er||0, totP.ip||0);
              return (
                <button key={t.name} onClick={() => setSelectedTeam(t.name)}
                  className="w-full text-left px-6 py-4 hover:bg-sky-50/40 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-stone-700 flex items-center justify-center text-white font-black text-sm flex-shrink-0" style={{fontFamily:DISPLAY}}>
                      {t.name.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-stone-800 group-hover:text-sky-700 transition-colors" style={{fontFamily:DISPLAY}}>{t.name}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{gp} game{gp!==1?"s":""} scouted</p>
                    </div>
                    <div className="flex gap-6 text-right flex-shrink-0">
                      {totH.ab > 0 && (
                        <div>
                          <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">AVG</p>
                          <p className="font-bold text-emerald-700" style={{fontFamily:MONO}}>{teamAvg}</p>
                        </div>
                      )}
                      {totP.ip > 0 && (
                        <div>
                          <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider">ERA</p>
                          <p className="font-bold text-indigo-700" style={{fontFamily:MONO}}>{teamEra}</p>
                        </div>
                      )}
                    </div>
                    <span className="text-stone-300 group-hover:text-stone-500 transition-colors text-lg">›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <ScoutAddGameModal
          onClose={() => setShowAdd(false)}
          onSave={(game) => { onAddGame(game); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
function BaseballApp() {
  const [teams, setTeams] = useState(() => lsLoad?.() || INITIAL_TEAMS);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [modal, setModal] = useState(null);
  const [schedulePreset, setSchedulePreset] = useState(null);
  const [statsPreset, setStatsPreset] = useState(null);
  const [statsPresetGame, setStatsPresetGame] = useState(null);
  const [dbStatus, setDbStatus] = useState("idle"); // idle | loading | saving | saved | error
  const [dbError, setDbError] = useState(null);
  const [scoutingTeams, setScoutingTeams] = useState(() => scoutLsLoad());

  // On mount: try to load from Supabase, overriding localStorage
  const { useEffect, useRef } = React;
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!dbLoad) return;
    setDbStatus("loading");
    dbLoad().then(data => {
      if (data) {
        setTeams(data);
        lsSave?.(data);
        setDbStatus("saved");
      } else {
        setDbStatus("idle");
      }
    }).catch(() => setDbStatus("error"));
  }, []);

  // Auto-save to Supabase + localStorage whenever teams changes (debounced 1.5s)
  const teamsRef = useRef(teams);
  useEffect(() => {
    teamsRef.current = teams;
    lsSave?.(teams);
    if (!dbSave) return;
    clearTimeout(saveTimer.current);
    setDbStatus("saving");
    saveTimer.current = setTimeout(() => {
      dbSave(teamsRef.current)
        .then(() => setDbStatus("saved"))
        .catch(e => { setDbStatus("error"); setDbError(e.message); });
    }, 1500);
  }, [teams]);

  const handleTeamsAdded = useCallback((newTeams) => {
    setTeams(prev => {
      const next = [...prev];
      newTeams.forEach(({ name, coach, division }) => {
        if (!next.find(t => t.name === name)) next.push({ ...initTeam(name), coach: coach||"", division: division||"" });
      });
      return next;
    });
  }, []);

  const handleScheduleAdded = useCallback((teamName, games) => {
    setTeams(prev => prev.map(t => {
      if (t.name !== teamName) return t;
      const existing = new Set(t.schedule.map(g => `${g.date}|${g.opponent}`));
      const toAdd = games.filter(g => !existing.has(`${g.date}|${g.opponent}`));
      return { ...t, schedule: [...t.schedule, ...toAdd] };
    }));
  }, []);

  const handleGameAdded = useCallback(({ teamName, scheduleIdx, opponent, myScore, oppScore, date, hitters, pitchers }) => {
    setTeams(prev => prev.map(t => {
      if (t.name !== teamName) return t;
      const result = myScore > oppScore ? "W" : myScore < oppScore ? "L" : "T";
      const newGame = { date, opponent, score: myScore, oppScore, result, hitters, pitchers };
      // Check if a game already exists for this schedule slot — replace it if so
      const schedEntry = t.schedule[scheduleIdx];
      const existingIdx = schedEntry
        ? t.games.findIndex(g => g.date === schedEntry.date && g.opponent === schedEntry.opponent)
        : -1;
      let newGames, newWins, newLosses;
      if (existingIdx >= 0) {
        // Replace existing — adjust W/L for the old result being removed
        const old = t.games[existingIdx];
        newWins   = t.wins   - (old.result === "W" ? 1 : 0) + (result === "W" ? 1 : 0);
        newLosses = t.losses - (old.result === "L" ? 1 : 0) + (result === "L" ? 1 : 0);
        newGames  = t.games.map((g, i) => i === existingIdx ? newGame : g);
      } else {
        newWins   = t.wins   + (result === "W" ? 1 : 0);
        newLosses = t.losses + (result === "L" ? 1 : 0);
        newGames  = [...t.games, newGame];
      }
      const newSched = t.schedule.map((g, i) =>
        i === scheduleIdx ? { ...g, result, score: myScore, oppScore, date } : g
      );
      return { ...t, games: newGames, wins: Math.max(0,newWins), losses: Math.max(0,newLosses), schedule: newSched };
    }));
  }, []);

  const handleDeleteGame = useCallback((teamName, gameIdx) => {
    setTeams(prev => prev.map(t => {
      if (t.name !== teamName) return t;
      const removed = t.games[gameIdx];
      const newGames = t.games.filter((_, i) => i !== gameIdx);
      const newWins   = t.wins   - (removed?.result === "W" ? 1 : 0);
      const newLosses = t.losses - (removed?.result === "L" ? 1 : 0);
      // restore schedule entry if linked
      const newSched = t.schedule.map(g =>
        (g.date === removed?.date && g.opponent === removed?.opponent && g.result)
          ? { ...g, result: undefined, score: undefined, oppScore: undefined }
          : g
      );
      return { ...t, games: newGames, wins: Math.max(0,newWins), losses: Math.max(0,newLosses), schedule: newSched };
    }));
  }, []);

  const handleMarkRainout = useCallback((teamName, gameIdx) => {
    setTeams(prev => prev.map(t => {
      if (t.name !== teamName) return t;
      const g = t.games[gameIdx];
      if (!g || g.type === "rainout") return t;
      // Remove the W/L from record, clear stats, mark as rainout
      const newWins   = t.wins   - (g.result === "W" ? 1 : 0);
      const newLosses = t.losses - (g.result === "L" ? 1 : 0);
      const newGames = t.games.map((game, i) =>
        i === gameIdx
          ? { date: game.date, opponent: game.opponent, type: "rainout", hitters: [], pitchers: [] }
          : game
      );
      const newSched = t.schedule.map(s =>
        (s.date === g.date && s.opponent === g.opponent && s.result)
          ? { ...s, result: undefined, score: undefined, oppScore: undefined }
          : s
      );
      return { ...t, games: newGames, wins: Math.max(0,newWins), losses: Math.max(0,newLosses), schedule: newSched };
    }));
  }, []);

  const handleDeleteSchedule = useCallback((teamName, schedIdx) => {
    setTeams(prev => prev.map(t => {
      if (t.name !== teamName) return t;
      const removed = t.schedule[schedIdx];
      const matchGame = t.games.findIndex(g => g.date === removed?.date && g.opponent === removed?.opponent);
      let newGames = t.games;
      let newWins = t.wins;
      let newLosses = t.losses;
      if (matchGame >= 0) {
        const g = t.games[matchGame];
        newWins = Math.max(0, t.wins - (g.result === "W" ? 1 : 0));
        newLosses = Math.max(0, t.losses - (g.result === "L" ? 1 : 0));
        newGames = t.games.filter((_, i) => i !== matchGame);
      }
      return { ...t, schedule: t.schedule.filter((_, i) => i !== schedIdx), games: newGames, wins: newWins, losses: newLosses };
    }));
  }, []);

  const handleRainoutSchedule = useCallback((teamName, schedIdx) => {
    setTeams(prev => prev.map(t => {
      if (t.name !== teamName) return t;
      const g = t.schedule[schedIdx];
      if (!g || g.type === "rainout") return t;
      // Remove any matching game log entry and adjust W/L
      const matchGame = t.games.findIndex(gm => gm.date === g.date && gm.opponent === g.opponent);
      let newGames = t.games;
      let newWins = t.wins;
      let newLosses = t.losses;
      if (matchGame >= 0) {
        const gm = t.games[matchGame];
        newWins = Math.max(0, t.wins - (gm.result === "W" ? 1 : 0));
        newLosses = Math.max(0, t.losses - (gm.result === "L" ? 1 : 0));
        newGames = t.games.map((gm2, i) => i === matchGame ? { ...gm2, type: "rainout", hitters: [], pitchers: [], result: undefined } : gm2);
      }
      const newSched = t.schedule.map((s, i) => i === schedIdx ? { ...s, type: "rainout", result: undefined, score: undefined, oppScore: undefined } : s);
      return { ...t, schedule: newSched, games: newGames, wins: newWins, losses: newLosses };
    }));
  }, []);

  const selectedTeamData = selectedTeam ? teams.find(t => t.name === selectedTeam) : null;
  const handleRenamePlayer = useCallback((teamName, wrongName, rightName) => {
    setTeams(prev => prev.map(t => {
      if (t.name !== teamName) return t;
      const newGames = t.games.map(g => ({
        ...g,
        hitters: (g.hitters||[]).map(p => p.name === wrongName ? {...p, name: rightName} : p),
        pitchers: (g.pitchers||[]).map(p => p.name === wrongName ? {...p, name: rightName} : p),
      }));
      return { ...t, games: newGames };
    }));
  }, []);

  const handleUpdateRoster = useCallback((teamName, roster) => {
    setTeams(prev => prev.map(t => t.name !== teamName ? t : { ...t, roster }));
  }, []);

  // Scouting persistence: load from Supabase on mount, overriding localStorage if present
  const scoutSaveTimer = useRef(null);
  const scoutingTeamsRef = useRef(scoutingTeams);
  const scoutHydrated = useRef(false);

  useEffect(() => {
    if (!window.DB?.scoutDbLoad) { scoutHydrated.current = true; return; }
    window.DB.scoutDbLoad().then(data => {
      if (data) {
        setScoutingTeams(data);
        scoutLsSave(data);
      }
      scoutHydrated.current = true;
    }).catch(() => { scoutHydrated.current = true; });
  }, []);

  // Auto-save scouting data to localStorage + Supabase whenever it changes (debounced 1.5s)
  useEffect(() => {
    scoutingTeamsRef.current = scoutingTeams;
    scoutLsSave(scoutingTeams);
    // Skip the very first save until we know whether Supabase had data to hydrate from,
    // so we don't overwrite remote data with a stale local copy on initial mount.
    if (!scoutHydrated.current) return;
    if (!window.DB?.scoutDbSave) return;
    clearTimeout(scoutSaveTimer.current);
    scoutSaveTimer.current = setTimeout(() => {
      window.DB.scoutDbSave(scoutingTeamsRef.current).catch(() => {});
    }, 1500);
  }, [scoutingTeams]);

  const handleScoutAddGame = React.useCallback((game) => {
    setScoutingTeams(prev => [...prev, game]);
  }, []);

  const handleScoutDeleteGame = React.useCallback((globalIdx) => {
    setScoutingTeams(prev => prev.filter((_,i) => i !== globalIdx));
  }, []);

  const handleScoutRenamePlayer = React.useCallback((teamName, oldName, newName) => {
    setScoutingTeams(prev => prev.map(g => {
      if (g.teamName !== teamName) return g;
      return {
        ...g,
        hitters: (g.hitters||[]).map(p => p.name === oldName ? {...p, name: newName} : p),
        pitchers: (g.pitchers||[]).map(p => p.name === oldName ? {...p, name: newName} : p),
      };
    }));
  }, []);

  const handleScoutDeletePlayer = React.useCallback((teamName, playerName) => {
    setScoutingTeams(prev => prev.map(g => {
      if (g.teamName !== teamName) return g;
      return {
        ...g,
        hitters: (g.hitters||[]).filter(p => p.name !== playerName),
        pitchers: (g.pitchers||[]).filter(p => p.name !== playerName),
      };
    }));
  }, []);

  const openScheduleFor = (name) => { setSchedulePreset(name); setModal("schedule"); };
  const openStatsFor = (name) => { setStatsPreset(name); setStatsPresetGame(null); setModal("stats"); };
  const openStatsForGame = (name, schedIdx) => { setStatsPreset(name); setStatsPresetGame(schedIdx); setModal("stats"); };

  return (
    <>
      {selectedTeamData ? (
        <TeamPage
          team={selectedTeamData}
          teams={teams}
          onTeamClick={(name) => setSelectedTeam(name)}
          onBack={() => setSelectedTeam(null)}
          onUploadSchedule={() => openScheduleFor(selectedTeamData.name)}
          onAddGame={() => openStatsFor(selectedTeamData.name)}
          onAddGameFromSchedule={(idx) => openStatsForGame(selectedTeamData.name, idx)}
          onDeleteGame={(idx) => handleDeleteGame(selectedTeamData.name, idx)}
          onMarkRainout={(idx) => handleMarkRainout(selectedTeamData.name, idx)}
          onDeleteSchedule={(idx) => handleDeleteSchedule(selectedTeamData.name, idx)}
          onRainoutSchedule={(idx) => handleRainoutSchedule(selectedTeamData.name, idx)}
          onUpdateRoster={(teamName, roster) => handleUpdateRoster(teamName, roster)}
        />
      ) : (
        <StandingsPage teams={teams} onTeamClick={setSelectedTeam}
          onUploadTeams={() => setModal("teams")}
          onUploadSchedule={() => { setSchedulePreset(null); setModal("schedule"); }}
          onUploadStats={() => { setStatsPreset(null); setModal("stats"); }}
          onFixPlayerName={() => setModal("rename")}
          dbStatus={dbStatus} dbError={dbError}
          scoutingTeams={scoutingTeams} onScoutAddGame={handleScoutAddGame} onScoutDeleteGame={handleScoutDeleteGame}
          onScoutRenamePlayer={handleScoutRenamePlayer} onScoutDeletePlayer={handleScoutDeletePlayer} />
      )}

      {modal === "teams" && (
        <TeamUploadModal existingTeams={teams} onClose={() => setModal(null)}
          onTeamsAdded={(t) => { handleTeamsAdded(t); setModal(null); }} />
      )}

      {modal === "schedule" && teams.length === 0 && (
        <ModalShell title="Upload Schedule" onClose={() => setModal(null)}>
          <div className="text-center py-8 space-y-3">
            <p className="text-stone-400">Add teams first before uploading a schedule.</p>
            <button onClick={() => setModal("teams")} className="bg-sky-700 hover:bg-sky-600 text-stone-900 font-bold px-6 py-2.5 rounded-xl transition-all">Add Teams →</button>
          </div>
        </ModalShell>
      )}

      {modal === "schedule" && teams.length > 0 && (
        <ScheduleModal
          teams={schedulePreset ? [teams.find(t=>t.name===schedulePreset),...teams.filter(t=>t.name!==schedulePreset)].filter(Boolean) : teams}
          presetTeam={schedulePreset}
          onClose={() => { setModal(null); setSchedulePreset(null); }}
          onScheduleAdded={(name, games) => { handleScheduleAdded(name, games); setModal(null); setSchedulePreset(null); }} />
      )}

      {modal === "rename" && (
        <PlayerRenameModal teams={teams} onClose={() => setModal(null)}
          onRename={(teamName, wrongName, rightName) => { handleRenamePlayer(teamName, wrongName, rightName); }} />
      )}

      {modal === "stats" && (
        <StatsUploadModal
          teams={teams}
          presetTeam={statsPreset}
          presetGameIdx={statsPresetGame}
          onClose={() => { setModal(null); setStatsPreset(null); setStatsPresetGame(null); }}
          onGameAdded={(d) => { handleGameAdded(d); setModal(null); setStatsPreset(null); setStatsPresetGame(null); }} />
      )}
    </>
  );
}
