"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format, addDays } from "date-fns";
import { LogOut, Home, RefreshCw, Settings, AlertCircle, Calendar as CalendarIcon, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      if (!tokenDraft) {
        setError("Please paste your Notion integration token.");
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
      let room = "", checkIn = "", checkOut = "", status = "";
      
      for (const [n, p] of Object.entries(props)) {
        const l = n.toLowerCase();
        if (p.type === "title" && !room) room = n;
        if (p.type === "date") {
          if (!checkIn && (l.includes("check in") || l.includes("checkin") || l.includes("arrival") || l.includes("start") || l.includes("from") || l.includes("date"))) checkIn = n;
          if (!checkOut && (l.includes("check out") || l.includes("checkout") || l.includes("departure") || l.includes("end") || l.includes("to"))) checkOut = n;
          if (!checkIn) checkIn = n;
        }
        if (!status && (l === "status" || l.includes("booking status"))) status = n;
      }
      
      setMapping(m => ({ ...m, room, checkIn, checkOut, status, bookedValues: [] }));
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
    if (!mapping.room || !mapping.checkIn) {
      setError("Room name and check-in date are required.");
      return;
    }
    setPhase("dashboard");
    setCountdown(30);
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
    if (!prop || prop.type !== "date" || !prop.date) return null;
    return { start: prop.date.start, end: prop.date.end || prop.date.start };
  };

  const isBooked = (page, dateStr) => {
    const m = mapping;
    if (m.status && m.bookedValues.length) {
      if (!m.bookedValues.includes(textOf(page.properties[m.status]))) return false;
    }
    const ci = dateOf(page.properties[m.checkIn]);
    if (!ci) return false;
    let end = ci.end;
    if (m.checkOut) {
      const co = dateOf(page.properties[m.checkOut]);
      end = co?.start || ci.end;
    }
    if (!end) end = ci.start;
    return m.checkOut
      ? (dateStr >= ci.start && dateStr < end)
      : (dateStr >= ci.start && dateStr <= end);
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
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Notion integration token</Label>
              <Input
                id="token"
                type="password"
                placeholder="secret_xxxxxxxxxxxxxxxxxxxx"
                value={tokenDraft}
                onChange={e => setTokenDraft(e.target.value)}
                onKeyDown={e => e.key === "Enter" && connect()}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Create an integration at <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="text-primary hover:underline">notion.so/my-integrations</a>
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
          <CardFooter>
            <Button className="w-full" onClick={() => connect()} disabled={loading}>
              {loading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Connecting...</> : "Connect"}
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
      return sp?.select?.options?.map(o => o.name) || sp?.multi_select?.options?.map(o => o.name) || [];
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
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Room / unit name <span className="text-destructive">*</span></Label>
              <Select value={mapping.room} onValueChange={v => setMapping(m => ({ ...m, room: v }))}>
                <SelectTrigger><SelectValue placeholder="— select —" /></SelectTrigger>
                <SelectContent>
                  {propEntries.map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Check-in date <span className="text-destructive">*</span></Label>
              <Select value={mapping.checkIn} onValueChange={v => setMapping(m => ({ ...m, checkIn: v }))}>
                <SelectTrigger><SelectValue placeholder="— select —" /></SelectTrigger>
                <SelectContent>
                  {propEntries.filter(([,p]) => p.type === "date").map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Check-out date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={mapping.checkOut} onValueChange={v => setMapping(m => ({ ...m, checkOut: v }))}>
                <SelectTrigger><SelectValue placeholder="— not set —" /></SelectTrigger>
                <SelectContent>
                  {propEntries.filter(([,p]) => p.type === "date").map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Booking status <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={mapping.status} onValueChange={v => setMapping(m => ({ ...m, status: v, bookedValues: [] }))}>
                <SelectTrigger><SelectValue placeholder="— all entries count as bookings —" /></SelectTrigger>
                <SelectContent>
                  {propEntries.filter(([,p]) => ["select", "multi_select"].includes(p.type)).map(([k]) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
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
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setPhase("token")}>Back</Button>
            <Button onClick={launchDashboard}>Launch dashboard</Button>
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
        return k !== mapping.room && (l.includes("guest") || l.includes("name") || l.includes("customer") || l.includes("client"));
      });
      if (ge) guest = textOf(ge[1]);
      const ci = dateOf(bk.properties[mapping.checkIn]);
      const co = mapping.checkOut ? dateOf(bk.properties[mapping.checkOut]) : null;
      if (ci) { 
        const end = co?.start || ci.end; 
        dates = end && end !== ci.start ? `${ci.start} to ${end}` : ci.start || ""; 
      }
    }

    return (
      <Card key={room} className={`transition-all hover:shadow-md ${isAvailable ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900' : 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900'}`}>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-lg">{room}</CardTitle>
          <div className="flex items-center gap-2 mt-1">
            {isAvailable ? 
              <Badge variant="outline" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 dark:bg-green-900 dark:text-green-300"><CheckCircle2 className="w-3 h-3 mr-1"/> Available</Badge> : 
              <Badge variant="outline" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 dark:bg-red-900 dark:text-red-300"><XCircle className="w-3 h-3 mr-1"/> Booked</Badge>
            }
          </div>
        </CardHeader>
        {(guest || dates || nextBk || !nextBk) && (
          <CardContent className="p-4 pt-2 text-sm text-muted-foreground space-y-1">
            {guest && <div className="font-medium text-foreground">👤 {guest}</div>}
            {dates && <div>📅 {dates}</div>}
            
            <div className={`mt-3 pt-3 border-t text-xs font-medium ${
              nextBk && bk && nextBk.id === bk.id ? "text-blue-600 dark:text-blue-400" :
              nextBk ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
            }`}>
              {nextBk && bk && nextBk.id === bk.id ? "➔ Continues tomorrow" :
               nextBk ? "➔ Booked tomorrow" : "➔ Available tomorrow"}
            </div>
          </CardContent>
        )}
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

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card border rounded-lg p-4 mb-8">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Label className="text-muted-foreground uppercase text-xs tracking-wider">Showing</Label>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)}
              className="w-[160px]"
            />
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}>
              Today
            </Button>
          </div>
          
          <div className="flex items-center gap-6 self-center">
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