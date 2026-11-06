"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/providers";
import { renewUserProfileEntity, writeUserProfileEntity } from "@/lib/arkiv/write";

type ProfileRole = "owner" | "renter" | "broker";
type LocalProfile = { entityKey: `0x${string}`; txHash: string; expiresAt: string };

export function UserProfileEntity() {
  const { address, connected } = useWallet();
  const [role, setRole] = useState<ProfileRole>("owner");
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [working, setWorking] = useState(false);
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const storageKey = useMemo(
    () => address ? `rmo.arkiv.profile.${address.toLowerCase()}.${role}` : null,
    [address, role],
  );

  useEffect(() => {
    setProfile(null);
    if (!storageKey) return;
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value) setProfile(JSON.parse(value) as LocalProfile);
    } catch {
      setProfile(null);
    }
  }, [storageKey]);

  const save = (next: LocalProfile) => {
    if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(next));
    setProfile(next);
  };

  const publish = async () => {
    if (!address) return;
    setWorking(true); setError(null); setNotice(null);
    try {
      const result = await writeUserProfileEntity(address, role);
      save({ entityKey: result.entityKey, txHash: result.txHash, expiresAt: result.expiresAt.toString() });
      setNotice("Profile entity published on Arkiv Rabdi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "arkiv_write_failed");
    } finally { setWorking(false); }
  };

  const renew = async () => {
    if (!address || !profile) return;
    setWorking(true); setError(null); setNotice(null);
    try {
      const result = await renewUserProfileEntity(address, profile.entityKey);
      save({ ...profile, txHash: result.txHash, expiresAt: result.expiresAt.toString() });
      setNotice("Profile expiry extended by 180 days from this transaction.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "arkiv_renewal_failed");
    } finally { setWorking(false); }
  };

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2>Public Arkiv profile</h2>
          <span className="micro dim">Wallet-linked · expires after 180 days</span>
        </div>
        <span className="badge badge--quiet">Rabdi testnet</span>
      </div>
      <div className="panel__body">
        <p className="small dim">This entity publishes only your connected wallet, selected role, and a random profile ID. Do not add your legal name, email, phone, ID documents, or lease details.</p>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="arkiv-profile-role">Public role</label>
            <select id="arkiv-profile-role" value={role} onChange={(event) => setRole(event.target.value as ProfileRole)}>
              <option value="owner">Property owner</option>
              <option value="renter">Renter</option>
              <option value="broker">Broker</option>
            </select>
          </div>
          <div className="field">
            <label>Wallet</label>
            <span className="mono small">{address ?? "Connect a wallet first"}</span>
          </div>
        </div>
        <label className="choice" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
          I understand this profile and wallet address are public on Arkiv.
        </label>
        {error && <p className="micro" style={{ color: "crimson", marginTop: 12 }}>Could not write profile ({error}).</p>}
        {notice && <p className="micro" style={{ color: "green", marginTop: 12 }}>{notice}</p>}
        {profile && (
          <p className="micro" style={{ marginTop: 12, overflowWrap: "anywhere" }}>
            Entity <span className="mono">{profile.entityKey}</span> · expires at Rabdi block <span className="mono">{profile.expiresAt}</span> · latest transaction <span className="mono">{profile.txHash}</span>
          </p>
        )}
        <div className="form-actions">
          {!profile ? (
            <button className="btn" type="button" disabled={!connected || !consented || working} onClick={() => void publish()}>
              {working ? "Waiting for wallet…" : "Publish 180-day profile"}
            </button>
          ) : (
            <button className="btn" type="button" disabled={!connected || !consented || working} onClick={() => void renew()}>
              {working ? "Waiting for wallet…" : "Renew for 180 days"}
            </button>
          )}
          <p className="form-actions__note">Your Rabdi wallet must approve the transaction and hold tGLM. The entity is read-only; only its owner can renew or delete it.</p>
        </div>
      </div>
    </section>
  );
}
