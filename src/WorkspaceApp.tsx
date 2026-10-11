import { Brand } from "./Brand";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  HardHat,
  Paintbrush,
  Building2,
  HeartHandshake,
  Cloud,
  LogOut,
} from "lucide-react";
import { Button, Busy, Field } from "./components";
import { StudioWorkspace } from "./StudioWorkspace";
import * as cloud from "./studio-cloud";
import {
  roleNames,
  type StudioData,
  type StudioMember,
  type StudioRole,
} from "./studio-model";
import { asset } from "./assets";
export default function WorkspaceApp() {
  const [mode, setMode] = useState<"welcome" | "demo" | "cloud">("welcome");
  const [role, setRole] = useState<StudioRole>("owner");
  const [config] = useState(cloud.savedCloudConfig);
  const [auth] = useState(() => (config ? cloud.startCloud(config) : null));
  const [user, setUser] = useState<cloud.User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [company, setCompany] = useState(
    new URLSearchParams(location.search).get("studio") ||
      localStorage.getItem("iq-company-id") ||
      "",
  );
  const [member, setMember] = useState<StudioMember | null>(null);
  const [data, setData] = useState<StudioData | null>(null);
  const [membershipReady, setMembershipReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  useEffect(
    () =>
      auth
        ? cloud.onAuthStateChanged(auth, (current) => {
            setUser(current);
            setAuthReady(true);
            setMember(null);
            setData(null);
            if (current) setMode("cloud");
          })
        : undefined,
    [auth],
  );
  useEffect(() => {
    setMember(null);
    setData(null);
    setMembershipReady(false);
    if (!user || !company) return;
    return cloud.watchMembership(
      company,
      user.uid,
      (value) => {
        setMember(value);
        setMembershipReady(true);
      },
      (e) => {
        setError(e.message);
        setMembershipReady(true);
      },
    );
  }, [user, company]);
  useEffect(() => {
    setData(null);
    if (!company || !member || member.active === false) return;
    let current = true;
    const stop = cloud.watchStudio(
      company,
      member,
      (value) => {
        if (current) setData(value);
      },
      (e) => {
        if (current) {
          setData(null);
          setError(`Your workspace could not load: ${e.message}`);
        }
      },
    );
    return () => {
      current = false;
      stop();
    };
  }, [company, member]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    if (auth && user) await cloud.signOut(auth);
    setMode("welcome");
    setData(null);
    setMember(null);
    setError("");
  };
  const openCompany = (id: string) => {
    setCompany(id);
    localStorage.setItem("iq-company-id", id);
    setError("");
  };
  if (mode === "demo")
    return (
      <StudioWorkspace
        demoRole={role}
        changeDemoRole={setRole}
        onLeave={() => setMode("welcome")}
      />
    );
  if (mode === "cloud" && user && member && member.active !== false && data)
    return (
      <StudioWorkspace cloudData={data} cloudMember={member} onLeave={leave} />
    );
  if (mode === "cloud" && user)
    return (
      <div className="studio-gate">
        <header>
          <Brand />
          <Button onClick={leave}>
            <LogOut size={16} />
            Sign out
          </Button>
        </header>
        <main className="join-workspace">
          <span className="eyebrow">WELCOME TO INTERIOR QUE</span>
          <h1>
            {member?.active === false
              ? "Your access is paused."
              : "A home for your team’s work."}
          </h1>
          <p>Signed in as {user.email}</p>
          {error && (
            <p className="studio-error" role="alert">
              {error}
            </p>
          )}
          {member?.active === false ? (
            <p>Ask the company owner to restore your access.</p>
          ) : company && (!membershipReady || member) ? (
            <Busy text="Opening your studio…" />
          ) : (
            <div className="join-grid">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = String(
                    new FormData(e.currentTarget).get("name") || "",
                  ).trim();
                  run(async () =>
                    openCompany(await cloud.createStudio(user, name)),
                  );
                }}
              >
                <Building2 />
                <h2>I own an interior firm</h2>
                <p>
                  Create a studio, add your first project, then invite the
                  people you work with.
                </p>
                <Field label="Company name" name="name" required />
                <Button type="submit" variant="primary" disabled={busy}>
                  Create my studio
                  <ArrowRight size={16} />
                </Button>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = String(
                    new FormData(e.currentTarget).get("company") || "",
                  ).trim();
                  run(async () =>
                    openCompany(await cloud.joinStudio(user, id)),
                  );
                }}
              >
                <HeartHandshake />
                <h2>I have an invitation</h2>
                <p>
                  Use the company code from your owner. Sign in with the email
                  address they invited.
                </p>
                <Field
                  label="Company code"
                  name="company"
                  value={company}
                  required
                />
                <Button type="submit" disabled={busy}>
                  Join the studio
                  <ArrowRight size={16} />
                </Button>
              </form>
            </div>
          )}
          {company && (
            <button
              className="text-btn"
              onClick={() => {
                openCompany("");
                setMembershipReady(false);
              }}
            >
              Choose another studio
            </button>
          )}
        </main>
      </div>
    );
  return (
    <div className="studio-gate">
      <header>
        <Brand />
        <div className="gate-links">
          <Button
            variant="primary"
            disabled={!auth || !authReady || busy}
            onClick={() =>
              run(async () => {
                await cloud.login(auth!);
                setMode("cloud");
              })
            }
          >
            Sign in with Google
            <ArrowRight size={16} />
          </Button>
        </div>
      </header>
      <main>
        <section className="gate-hero">
          <div>
            <div className="eyebrow">MADE FOR INTERIOR DESIGN TEAMS</div>
            <h1>
              One studio.
              <br />
              Everyone in sync.
            </h1>
            <p>
              From the first drawing to the final walkthrough. Give everyone a
              clear view of what’s next.
            </p>
            <div className="gate-buttons">
              <Button
                variant="primary"
                onClick={() => {
                  setRole("owner");
                  setMode("demo");
                }}
              >
                Explore the workspace
                <ArrowRight size={18} />
              </Button>
              <span>No setup needed to try the demo</span>
            </div>
            <div className="gate-promises">
              <span>
                <CheckCircle2 size={16} />
                Clear tasks
              </span>
              <span>
                <CheckCircle2 size={16} />
                Faster approvals
              </span>
              <span>
                <CheckCircle2 size={16} />
                Visible site progress
              </span>
            </div>
          </div>
          <div className="gate-photo">
            <img
              src={asset("/images/living.jpg")}
              alt="A bright, thoughtfully designed living room"
            />
            <div>
              <span>
                <Cloud size={17} />
                CONNECTED STUDIO
              </span>
              <b>
                Good design.
                <br />
                Better coordination.
              </b>
              <small>Design · Build · Review · Deliver</small>
            </div>
          </div>
        </section>
        <section className="gate-roles">
          <div className="gate-section-title">
            <span className="eyebrow">A CLEAR WORKSPACE FOR EVERYONE</span>
            <h2>Less searching. More getting things done.</h2>
            <p>Try each role to see the daily workflow.</p>
          </div>
          {(
            [
              {
                role: "owner",
                icon: Building2,
                text: "Keep projects moving, manage your team and track the money.",
              },
              {
                role: "designer",
                icon: Paintbrush,
                text: "Know your next task. Share drawings and get decisions in one place.",
              },
              {
                role: "supervisor",
                icon: HardHat,
                text: "Record the day’s work, flag blockers and share updates from site.",
              },
              {
                role: "client",
                icon: HeartHandshake,
                text: "Follow your project and approve the choices that need your attention.",
              },
            ] as const
          ).map(({ role, icon: Icon, text }) => (
            <button
              className="gate-role"
              key={role}
              onClick={() => {
                setRole(role);
                setMode("demo");
              }}
            >
              <Icon />
              <h3>{roleNames[role]}</h3>
              <p>{text}</p>
              <span>
                Try this view
                <ArrowRight size={16} />
              </span>
            </button>
          ))}
        </section>
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        <div className="gate-setup">
          <span>
            {config
              ? "Company sign-in is connected to the development environment."
              : "Team sign-in is being prepared. You can explore every workflow in the demo."}
          </span>
          <button onClick={() => setSetup(!setup)}>Company setup</button>
        </div>
        {setup && (
          <form
            className="cloud-setup"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const raw = String(
                  new FormData(e.currentTarget).get("config") || "",
                );
                const parsed = cloud.parseCloudConfig(raw);
                localStorage.setItem(
                  "iq-firebase-config",
                  JSON.stringify(parsed),
                );
                location.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <h2>Development connection</h2>
            <p>
              For the app administrator: use the separate development Firebase
              web app configuration. Deploy the tested Interior Que rules there
              before enabling team access. DesignQuote production stays separate
              during development.
            </p>
            <Field
              label="Firebase web app configuration (JSON)"
              name="config"
              type="textarea"
              required
            />
            <Button type="submit">Connect development project</Button>
          </form>
        )}
      </main>
      <footer>Interior Que · Project management for the whole studio.</footer>
    </div>
  );
}
