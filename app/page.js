"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format, addDays } from "date-fns";
import { LogOut, Home, RefreshCw, Settings, AlertCircle, Calendar as CalendarIcon, CheckCircle2, XCircle, User, ArrowRight } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const mappingSchema = z.object({
  room: z.string().min(1, "Room name is required"),
  checkIn: z.string().min(1, "Check-in date is required"),
  checkOut: z.string().optional(),
  status: z.string().optional(),
  bookedValues: z.array(z.string()).optional()
});

const tokenSchema = z.object({
  token: z.string()
    .min(1, "Notion integration token is required.")
    .regex(/^secret_[a-zA-Z0-9]+$/, "Token must be a valid Notion integration secret (starts with 'secret_').")
});

export default function Dashboard() {
  const [phase, setPhase] = useState("loading"); // loading, token, setup, dashboard
  const [config, setConfig] = useState({ dbId: "", hasEnvToken: false });
  const [tokenDraft, setTokenDraft] = useState("");
  const [token, setToken] = useState("");
  const [schema, setSchema] = useState(null);
  const [dbTitle, setDbTitle] = useState("SAFE HAVEN HOMESTAY");
  
  const [mapping, setMapping] = useState({ room: "", checkIn: "", checkOut: "", status: "", bookedValues: [] });
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown] = useState(30);

  const nReq = async (path, body = null) => {
    const url = "/api" + path;
    const headers = {
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    };
    if (token && token !== "env") {
      headers["Authorization"] = "Bearer " + token;
    }
    const res = await axios({
      method: body ? "POST" : "GET",
      url,
      headers,
      data: body,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      throw new Error(res.data?.message || `HTTP ${res.status}`);
    }
    return res.data;
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get("/api/config");
        const conf = res.data;
        setConfig(conf);
        
        if (conf.hasEnvToken) {
          setToken("env");
          connect(true, conf.dbId, "env");
        } else {
          setPhase("token");
        }
      } catch (e) {
        console.error("Config fetch failed:", e);
        setPhase("token");
      }
    };
    init();
  }, []);

  const connect = async (auto = false, useDbId = config.dbId, useToken = token) => {
    if (!auto) {
      try {
        tokenSchema.parse({ token: tokenDraft });
      } catch (err) {
        if (err instanceof z.ZodError) {
          setError(err.errors[0].message);
        } else {
          setError("Invalid token format.");
        }
        return;
      }
      setToken(tokenDraft);
      useToken = tokenDraft;
    }
    
    setError("");
    setLoading(true);
    try {
      const db = await nReq("/databases/" + useDbId);
      setSchema(db);
      setDbTitle(db.title?.[0]?.plain_text || "SAFE HAVEN HOMESTAY");
      
      const props = db.properties;
      const propKeys = Object.keys(props);
      
      const room = propKeys.find(k => k.toLowerCase() === "room" || k.toLowerCase() === "rooms") || 
                   propKeys.find(k => k.toLowerCase().includes("room")) ||
                   propKeys.find(k => props[k].type === "select" && k.toLowerCase().includes("room")) || 
                   propKeys.find(k => props[k].type === "title") || 
                   "";
                   
      const checkIn = propKeys.find(k => k.toLowerCase() === "check-in") || 
                      propKeys.find(k => props[k].type === "date" && k.toLowerCase().includes("in")) || 
                      propKeys.find(k => props[k].type === "date") || 
                      "";
                      
      const checkOut = propKeys.find(k => k.toLowerCase() === "check-out") || 
                       propKeys.find(k => props[k].type === "date" && k.toLowerCase().includes("out")) || 
                       "";
                       
      const status = propKeys.find(k => k.toLowerCase() === "confirmation #") || 
                     propKeys.find(k => k.toLowerCase() === "status" || k.toLowerCase().includes("booking")) || 
                     "";
      
      setMapping(m => ({ ...m, room, checkIn, checkOut, status, bookedValues: ["Confirmed"] }));
      setPhase("setup");
    } catch (e) {
      setError(e.message);
      if (auto) setPhase("token");
    }
    setLoading(false);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let all = [];
      let cursor = null;
      do {
        const body = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const r = await nReq("/databases/" + config.dbId + "/query", body);
        all = all.concat(r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      
      setBookings(all);
      const rs = new Set();
      for (const pg of all) {
        const r = textOf(pg.properties[mapping.room]);
        if (r && r !== "Untitled" && r.trim()) rs.add(r.trim());
      }
      setRooms([...rs].sort());
      setLastUpdated(new Date());
      setError("");
      setCountdown(30);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    let refreshTimer, cdTimer;
    if (phase === "dashboard") {
      fetchData();
      refreshTimer = setInterval(() => {
        fetchData();
      }, 30000);
      cdTimer = setInterval(() => {
        setCountdown(c => (c <= 1 ? 30 : c - 1));
      }, 1000);
    }
    return () => {
      clearInterval(refreshTimer);
      clearInterval(cdTimer);
    };
  }, [phase]);

  const launchDashboard = () => {
    try {
      mappingSchema.parse(mapping);
      setError("");
      setPhase("dashboard");
      setCountdown(30);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("Invalid mapping configuration.");
      }
    }
  };

  const textOf = (prop) => {
    if (!prop) return "";
    switch (prop.type) {
      case "title": return prop.title?.map(t => t.plain_text).join("") || "Untitled";
      case "rich_text": return prop.rich_text?.map(t => t.plain_text).join("") || "";
      case "select": return prop.select?.name || "";
      case "multi_select": return prop.multi_select?.map(s => s.name).join(", ") || "";
      case "number": return String(prop.number ?? "") || "";
      case "phone_number": return prop.phone_number || "";
      case "email": return prop.email || "";
      default: return "";
    }
  };

  const dateOf = (prop) => {
    if (!prop) return null;
    let d = null;
    if (prop.type === "date") d = prop.date;
    if (prop.type === "formula" && prop.formula?.type === "date") d = prop.formula.date;
    if (!d) return null;
    return { start: d.start, end: d.end || d.start };
  };

  const isBooked = (page, dateStr) => {
    const m = mapping;
    
    // Status checking (case-insensitive and trimmed to avoid spaces breaking it)
    if (m.status && m.bookedValues.length > 0) {
      const statusText = textOf(page.properties[m.status]).trim().toLowerCase();
      const allowed = m.bookedValues.map(v => v.trim().toLowerCase());
      if (!allowed.includes(statusText)) return false;
    }
    
    const ci = dateOf(page.properties[m.checkIn]);
    if (!ci) return false; // Without a check-in date, we can't determine booking
    
    // Fallback: If there is no separate checkOut field mapped, see if the checkIn field contains a range 
    // Notion API returns ranges inside the same property like: { start: '2026-05-01', end: '2026-05-03' }
    let end = ci.end; 
    
    // If a separate checkOut column is mapped, override it
    if (m.checkOut) {
      const co = dateOf(page.properties[m.checkOut]);
      if (co) end = co.start || co.end;
    }
    
    if (!end) end = ci.start;

    // We strip out timezones/times and parse strictly by the calendar day
    // The "T00:00:00" ensures local parsing doesn't shift the day by accident
    const startDay = new Date(ci.start.split('T')[0] + "T00:00:00");
    const endDay = new Date(end.split('T')[0] + "T00:00:00");
    const checkDay = new Date(dateStr.split('T')[0] + "T00:00:00");

    // Failsafe in case of invalid parsing
    if (isNaN(startDay.getTime()) || isNaN(endDay.getTime())) return false;

    if (startDay.getTime() === endDay.getTime()) {
      // Single day booking (check-in and check-out are the exact same day)
      return checkDay.getTime() === startDay.getTime();
    } else {
      // Range booking: it is booked FROM the check-in day UP TO (but excluding) the check-out day.
      // This means the check-out day itself is "Available" for the next guest!
      return checkDay.getTime() >= startDay.getTime() && checkDay.getTime() < endDay.getTime();
    }
  };

  const bookingFor = (room, dateStr) => {
    return bookings.find(b => textOf(b.properties[mapping.room]).trim() === room && isBooked(b, dateStr));
  };

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <strong className="text-lg font-medium text-foreground">Connecting to environment...</strong>
        </div>
      </div>
    );
  }

  if (phase === "token") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Home className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Room availability</CardTitle>
            <CardDescription>Connect your Notion booking database to see which rooms are free — updating every 30 seconds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-medium">Notion integration token</Label>
              <Input
                id="token"
                type="password"
                placeholder="secret_xxxxxxxxxxxxxxxxxxxx"
                className={`h-11 w-full ${error.includes("token") || error.includes("secret") ? "border-destructive ring-destructive/20" : ""}`}
                value={tokenDraft}
                onChange={e => { setTokenDraft(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && connect()}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Create an integration at <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">notion.so/my-integrations</a>
              </p>
            </div>
            
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="pt-6 border-t mt-4">
            <Button className="w-full h-11 text-base font-semibold" onClick={() => connect()} disabled={loading}>
              {loading ? <><RefreshCw className="h-5 w-5 mr-2 animate-spin" /> Connecting...</> : "Connect"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (phase === "setup") {
    const propEntries = schema ? Object.entries(schema.properties) : [];
    
    const getStatusVals = () => {
      if (!mapping.status || !schema) return [];
      const sp = schema.properties[mapping.status];
      return sp?.select?.options?.map(o => o.name) || sp?.multi_select?.options?.map(o => o.name) || ["Confirmed"];
    };
    
    const statusVals = getStatusVals();

    const toggleBookedValue = (val) => {
      setMapping(m => {
        const idx = m.bookedValues.indexOf(val);
        const newVals = [...m.bookedValues];
        if (idx >= 0) newVals.splice(idx, 1);
        else newVals.push(val);
        return { ...m, bookedValues: newVals };
      });
    };

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-xl">Map your properties</CardTitle>
            <CardDescription>We've auto-detected your database structure. Confirm or adjust below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Room / unit name <span className="text-destructive">*</span></Label>
              <Select value={mapping.room} onValueChange={v => { setMapping(m => ({ ...m, room: v })); setError(""); }}>
                <SelectTrigger className={`w-full h-11 ${error.includes("Room") ? "border-destructive ring-destructive/20" : ""}`}>
                  <SelectValue placeholder="— select —">
                    {mapping.room || "— select —"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {propEntries.map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Check-in date <span className="text-destructive">*</span></Label>
              <Select value={mapping.checkIn} onValueChange={v => { setMapping(m => ({ ...m, checkIn: v })); setError(""); }}>
                <SelectTrigger className={`w-full h-11 ${error.includes("Check-in") ? "border-destructive ring-destructive/20" : ""}`}>
                  <SelectValue placeholder="— select —">
                    {mapping.checkIn || "— select —"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {propEntries.filter(([,p]) => p.type === "date").map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center justify-between">
                <span>Check-out date</span>
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select value={mapping.checkOut} onValueChange={v => setMapping(m => ({ ...m, checkOut: v }))}>
                <SelectTrigger className="w-full h-11">
                  <SelectValue placeholder="— not set —">
                    {mapping.checkOut || "— not set —"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {propEntries.filter(([,p]) => p.type === "date").map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center justify-between">
                <span>Booking status</span>
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select value={mapping.status} onValueChange={v => setMapping(m => ({ ...m, status: v, bookedValues: ["Confirmed"] }))}>
                <SelectTrigger className="w-full h-11">
                  <SelectValue placeholder="— select —">
                    {mapping.status || "— select —"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {propEntries.filter(([,p]) => ["select", "multi_select", "rich_text"].includes(p.type)).map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {statusVals.length > 0 && (
              <div className="space-y-2 pt-2">
                <Label>Which values mean "booked"? <span className="text-muted-foreground font-normal">(tap to select)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {statusVals.map(v => (
                    <Badge 
                      key={v}
                      variant={mapping.bookedValues.includes(v) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleBookedValue(v)}
                    >
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-6 border-t mt-4">
            <Button variant="outline" className="w-full sm:w-auto h-11" onClick={() => setPhase("token")}>Back</Button>
            <Button className="w-full sm:w-auto h-11" onClick={launchDashboard}>Launch dashboard</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Dashboard Phase
  const dObj = new Date(selectedDate);
  dObj.setUTCDate(dObj.getUTCDate() + 1);
  const nextD = dObj.toISOString().split("T")[0];

  const avail = [];
  const booked = [];
  
  for (const room of rooms) {
    const bk = bookingFor(room, selectedDate);
    const nextBk = bookingFor(room, nextD);
    if (bk) booked.push({ room, bk, nextBk });
    else avail.push({ room, bk, nextBk });
  }

  const renderRoomCard = ({ room, bk, nextBk }, isAvailable) => {
    let guest = "", dates = "";
    if (bk) {
      const ge = Object.entries(bk.properties).find(([k]) => {
        const l = k.toLowerCase();
        return k !== mapping.room && (l.includes("guest") || l.includes("name") || l.includes("customer") || l.includes("client") || l.includes("title"));
      });
      if (ge) guest = textOf(ge[1]);
      
      const ci = dateOf(bk.properties[mapping.checkIn]);
      const co = mapping.checkOut ? dateOf(bk.properties[mapping.checkOut]) : null;
      
      if (ci) { 
        let end = ci.end;
        if (co) end = co.start || co.end;
        
        // Only show range if end exists and is different from start
        if (end && end !== ci.start) {
            dates = `${ci.start} to ${end}`;
        } else {
            dates = ci.start || ""; 
        }
      }
    }

    return (
      <Card key={room} className="flex flex-col h-full hover:shadow-md transition-shadow duration-200 overflow-hidden">
        <CardHeader className={`flex flex-row items-center justify-between space-y-0 p-4 border-b ${isAvailable ? 'bg-green-50/50 dark:bg-green-950/20' : 'bg-red-50/50 dark:bg-red-950/20'}`}>
          <CardTitle className="text-base font-semibold">{room}</CardTitle>
          {isAvailable ? 
            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-400 dark:border-green-800"><CheckCircle2 className="w-3 h-3 mr-1"/> Available</Badge> : 
            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-400 dark:border-red-800"><XCircle className="w-3 h-3 mr-1"/> Booked</Badge>
          }
        </CardHeader>
        <CardContent className="flex-1 p-4 pt-4 flex flex-col">
          {(guest || dates) ? (
            <div className="space-y-2 text-sm text-muted-foreground mb-4">
              {guest && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 shrink-0 opacity-70" /> 
                  <span className="font-medium text-foreground">{guest}</span>
                </div>
              )}
              {dates && (
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" /> 
                  <span>{dates}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground/60 italic mb-4">No guest info</div>
          )}
          
          <div className={`mt-auto pt-3 border-t text-xs font-medium flex items-center gap-1.5 ${
            nextBk && bk && nextBk.id === bk.id ? "text-blue-600 dark:text-blue-400" :
            nextBk ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
          }`}>
            <ArrowRight className="w-3.5 h-3.5" />
            {nextBk && bk && nextBk.id === bk.id ? "Continues tomorrow" :
             nextBk ? "Booked tomorrow" : "Available tomorrow"}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <header className="bg-card border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Home className="h-5 w-5" />
            {dbTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Booking availability dashboard</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center text-xs text-muted-foreground">
            {loading ? (
              <span className="flex items-center"><RefreshCw className="h-3 w-3 mr-2 animate-spin" /> Refreshing...</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Updated {lastUpdated ? format(lastUpdated, "HH:mm") : "—"} · next in {countdown}s
              </span>
            )}
          </div>
          
          <Button variant="outline" size="sm" onClick={fetchData} className="hidden sm:flex">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <Button variant="outline" size="icon" onClick={() => { setPhase("setup"); }} title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
          
          <form method="POST" action="/api/auth/signout">
            <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 bg-card border rounded-lg p-4 md:p-6 mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <Label className="text-muted-foreground uppercase text-xs tracking-wider font-semibold">Date</Label>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full sm:w-[180px] h-10"
            />
            <Button variant="secondary" className="h-10 w-full sm:w-auto" onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}>
              Today
            </Button>
          </div>
          
          <div className="flex items-center justify-center gap-6 sm:gap-10 self-center w-full md:w-auto py-2">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-500">{avail.length}</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Available</div>
            </div>
            <div className="w-px h-10 bg-border"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-500">{booked.length}</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Booked</div>
            </div>
            <div className="w-px h-10 bg-border"></div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{rooms.length}</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Total</div>
            </div>
          </div>
        </div>

        {rooms.length === 0 && !loading && (
          <div className="text-center py-20 text-muted-foreground">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground mb-1">No rooms found</h3>
            <p>Make sure the "Room / unit name" property is mapped correctly and your database has entries.</p>
          </div>
        )}

        {avail.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              Available ({avail.length})
              <div className="h-px bg-border flex-1 ml-2"></div>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {avail.map(x => renderRoomCard(x, true))}
            </div>
          </div>
        )}

        {booked.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              Booked ({booked.length})
              <div className="h-px bg-border flex-1 ml-2"></div>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {booked.map(x => renderRoomCard(x, false))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}