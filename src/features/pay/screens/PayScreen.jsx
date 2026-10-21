// ─────────────────────────────────────────────────────────────────────────────
// features/pay/screens/PayScreen.jsx — "My Pay". The PayTab root.
//
// Plan of record: NativeRef/00-plan/07-pay-screen-plan.md. It supersedes the
// five-card menu in 40-screens/05-pay.md.
//
// ── ONE SCREEN, EIGHT SECTIONS — THE SAME SHAPE AS MY TIME ──────────────────
//
// The old plan had PayHome as a menu of cards that each pushed a screen. That
// is the pattern the user rejected for Leave on 2026-10-18:
//
//   "also fix my leave and other screens which navigate to a new screen, nah
//    you have to show like other actions are showing content below"
//
// Eight routes would be eight native headers and eight back presses for
// figures people read AGAINST EACH OTHER — "what reached my bank" against
// "what I still owe" against "tax so far". A section switch costs a tap and
// keeps the scroll. The web's MY PAY sidebar menu maps onto the strip entry
// for entry, plus Bank, Benefits and Extras, which the web buries inside
// other pages:
//
//   My Payslips         → section 'payslips'   (MyPayslipsPage)
//   My Salary           → section 'salary'     (MySalaryPage)
//   Bank account        → section 'bank'       (a panel of MySalaryPage)
//   My Reimbursements   → section 'claims'     (MyReimbursementsPage)
//   Benefits            → section 'benefits'   (/me/benefits, no web page)
//   Loans & Advances    → section 'loans'      (MyLoansAndAdvancesPage)
//   Variable pay        → section 'extras'     (bonuses + adjustments)
//   Tax & Investments   → section 'tax'        (MyTaxAndInvestmentsPage)
//
// The three FORMS are still routes, because a record being WRITTEN is a page
// and a record being READ is a sheet (CLAUDE.md §4): `BankAccount`,
// `ClaimForm`, `DeclarationForm`, each `presentation: 'modal'`.
//
// ── THE HERO IS THE LAST PAYSLIP, AND IT COSTS NOTHING ──────────────────────
//
// `getMyPayslips()` is read ONCE here and handed to both the hero and the
// Payslips section — the hero is literally the newest row of that list. One
// request, two readers.
//
// NEVER A ₹0 HERO. No payslip yet is an absence, not a payment of nothing;
// ₹0 would tell somebody they were paid nothing this month. The hero becomes
// the empty state instead.
//
// ── A SECTION AN ORG DOESN'T HAVE IS ABSENT, NOT BROKEN (CLAUDE.md §2) ──────
//
// Most tenants are missing at least Loans and Benefits, so this is the common
// case and not the edge one. `usePaySections` probes the four optional
// endpoints once, in parallel. A 404 or a disabled module DROPS THE TILE. A
// 500, a timeout or no signal does NOT — a flaky minute must not make
// features disappear, and the section's own error state is where a failed
// read belongs. `null` means "still asking", and while it is null the tile is
// SHOWN: a strip that grows an item a second after you look at it is worse
// than one that loses an item nobody could use.
//
// ── EVERY SECTION IS ITS OWN SCROLLER ───────────────────────────────────────
//
// The strip is the only pinned chrome; the hero scrolls with the section's
// content rather than eating 140pt of a phone permanently. Sections mount one
// at a time — eight kept alive would be eight sets of requests on first open,
// for seven views nobody is looking at.
//
// ── HIDDEN UNTIL THE PHONE CONFIRMS IT'S YOU (user, 2026-10-21) ─────────────
//
// "In salary showing screen, show it hidden, ask biometric and then show it,
// it can be turned off from settings." While locked (lib/payPrivacy.js) the
// hero's figure is dots and the strip and sections are replaced by one panel
// with a "Show my pay" button — the sections don’t MOUNT and the payslips
// aren’t read until it opens. Unlocked lasts until the app goes to
// the background; the eye on the hero locks it again by hand. Settings ›
// Privacy turns the whole thing off.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { payrollAPI } from '../../../api';
import { useResource } from '../../../hooks/useResource';
import { isFeatureDisabled, isNotFound } from '../../../lib/errors/attendanceErrors';
import { formatMoney } from '../../../lib/format';
import { usePayPrivacy } from '../../../lib/payPrivacy';
import { color, radius, space, text } from '../../../theme/tokens';
import { icons } from '../../../theme/icons';
import { Button, HeroCard, showToast } from '../../../ui';
import { CategoryStrip } from '../../../ui/ListCards';
import { AppTopBar } from '../../../navigation/AppTopBar';
import { BankTab } from '../components/BankTab';
import { BenefitsTab } from '../components/BenefitsTab';
import { ClaimsTab } from '../components/ClaimsTab';
import { ExtrasTab } from '../components/ExtrasTab';
import { LoansTab } from '../components/LoansTab';
import { PayslipsTab, selectPayslips } from '../components/PayslipsTab';
import { SalaryTab } from '../components/SalaryTab';
import { TaxTab } from '../components/TaxTab';
import { slipNet } from '../payMeta';

/* ─── Which sections this organisation actually has ───────────────────────── */

function usePaySections() {
  const [available, setAvailable] = useState({
    claims: null, benefits: null, loans: null, tax: null,
  });

  useEffect(() => {
    let cancelled = false;
    const probe = (key, call) => call()
      .then(() => { if (!cancelled) setAvailable((a) => ({ ...a, [key]: true })); })
      .catch((err) => {
        const missing = isNotFound(err) || isFeatureDisabled(err);
        if (!cancelled) setAvailable((a) => ({ ...a, [key]: !missing }));
      });

    // These ask "does this module exist?", not "what is in it?". Each section
    // fetches its own data when it opens.
    probe('claims', () => payrollAPI.getMyReimbursementCategories());
    probe('benefits', () => payrollAPI.getMyBenefits());
    probe('loans', () => payrollAPI.getMyLoans());
    probe('tax', () => payrollAPI.getMyTaxSummary());

    return () => { cancelled = true; };
  }, []);

  return available;
}

/* ─── The hero ────────────────────────────────────────────────────────────── */

/* The state card (ui/HeroCard). The one number people open this tab for —
   what reached the bank — and NOTHING ELSE (user, 2026-10-20): no chevron, no
   rupee tile, no month line; the figure, big. Payslips is already the section
   right under it, so the card has nowhere to go and does not pretend to. No
   payslip yet is a card with words, never a ₹0. */
function PayHero({ payslips, hidden, onHide }) {
  const latest = (payslips.data || [])[0] || null;
  const loading = payslips.loading && !payslips.data?.length;
  const EyeOff = icons.eyeSlash;

  if (!hidden && !latest && !loading) {
    return (
      <HeroCard
        eyebrow="Your pay"
        title="No payslips yet"
        caption="One appears here once your employer releases that month’s pay."
      />
    );
  }

  return (
    <HeroCard
      eyebrow="Reached your bank"
      metric
      big
      title={hidden ? '₹ ••••••' : latest ? formatMoney(slipNet(latest)) : ''}
      loading={loading && !hidden}
      right={!hidden && onHide && EyeOff ? (
        <Pressable
          onPress={onHide}
          accessibilityRole="button"
          accessibilityLabel="Hide my pay"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? color.brandSoftBorder : color.brandChipBg,
          })}
        >
          <EyeOff size={20} color={color.brandChipFg} />
        </Pressable>
      ) : null}
    />
  );
}

/* ─── The lock ────────────────────────────────────────────────────────────────
   One panel where the sections would be: the fingerprint, one line, one
   button. The person already knows what is behind it. */
function PayLock({ onUnlock, busy }) {
  const Finger = icons.fingerprint || icons.locked;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[6], gap: space[3] }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radius.full,
          backgroundColor: color.brandChipBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Finger ? <Finger size={34} color={color.brandChipFg} /> : null}
      </View>
      <Text style={[text.h2, { textAlign: 'center' }]}>Your pay is hidden</Text>
      <Text style={[text.small, { textAlign: 'center' }]}>Confirm it’s you to see it.</Text>
      <Button title="Show my pay" icon={Finger} onPress={onUnlock} loading={busy} style={{ marginTop: space[2] }} />
    </View>
  );
}

/* ─── The screen ──────────────────────────────────────────────────────────── */

export default function PayScreen({ navigation, route }) {
  const [section, setSection] = useState('payslips');
  const privacy = usePayPrivacy();
  const [unlocking, setUnlocking] = useState(false);
  const { unlock } = privacy;
  const showPay = useCallback(async () => {
    if (unlocking) return;
    setUnlocking(true);
    const result = await unlock();
    setUnlocking(false);
    if (result === 'locked_out') showToast('Too many tries. Unlock your phone, then try again.', 'error');
    else if (result === 'failed') showToast('We couldn’t confirm it’s you. Please try again.', 'error');
  }, [unlock, unlocking]);

  const available = usePaySections();

  // ONE read, two readers: the hero and the Payslips section.
  // Not asked for while the pay is hidden — see the header.
  const payslips = useResource(() => payrollAPI.getMyPayslips(), {
    select: selectPayslips,
    initial: [],
    enabled: !privacy.locked,
  });

  const sections = useMemo(() => [
    { value: 'payslips', label: 'Payslips', icon: icons.document },
    { value: 'salary', label: 'Salary', icon: icons.chart },
    { value: 'bank', label: 'Bank', icon: icons.bank },
    available.claims !== false && { value: 'claims', label: 'Claims', icon: icons.claims },
    available.benefits !== false && { value: 'benefits', label: 'Benefits', icon: icons.heart },
    available.loans !== false && { value: 'loans', label: 'Loans', icon: icons.cash },
    { value: 'extras', label: 'Extras', icon: icons.up },
    available.tax !== false && { value: 'tax', label: 'Tax', icon: icons.tax },
  ].filter(Boolean), [available.claims, available.benefits, available.loans, available.tax]);

  // A section that disappears under somebody standing on it sends them back to
  // the default rather than leaving the strip pointing at nothing.
  useEffect(() => {
    if (!sections.some((s) => s.value === section)) setSection('payslips');
  }, [sections, section]);

  /* A drawer row or a Home quick action names its section
     (navigation/routes.js: `claims` → `{ section: 'claims' }`). The param is
     CLEARED once applied, or it is sticky: tap "Payslips" in the drawer,
     switch to Tax by hand, come back to the tab later and the screen snaps
     back to Payslips because the param is still sitting on the route. */
  const requested = route?.params?.section;
  useEffect(() => {
    if (!requested) return;
    setSection(requested);
    navigation.setParams({ section: undefined });
  }, [requested, navigation]);

  const editBank = useCallback(() => navigation.navigate('BankAccount'), [navigation]);
  const newClaim = useCallback(
    (category) => navigation.navigate('ClaimForm', category?.id ? { categoryId: category.id } : undefined),
    [navigation],
  );
  const openClaim = useCallback((claimId) => navigation.navigate('ClaimForm', { claimId }), [navigation]);
  const declare = useCallback(() => navigation.navigate('DeclarationForm'), [navigation]);

  return (
    // Slate-50: this screen is lists of cards, and a white card on a white
    // screen has to draw a heavier edge to exist.
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <AppTopBar />

      {/* On the canvas, not a white band with a hairline (2026-10-20). */}
      <View style={{ paddingTop: space[1] }}>
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
          <PayHero
            payslips={payslips}
            hidden={privacy.locked}
            onHide={privacy.hideEnabled ? privacy.lock : undefined}
          />
        </View>
        {!privacy.locked ? <CategoryStrip items={sections} value={section} onChange={setSection} /> : null}
      </View>

      <View style={{ flex: 1 }}>
        {privacy.locked ? (
          <PayLock onUnlock={showPay} busy={unlocking} />
        ) : section === 'payslips' ? (
          <PayslipsTab payslips={payslips} />
        ) : section === 'salary' ? (
          <SalaryTab />
        ) : section === 'bank' ? (
          <BankTab onEdit={editBank} />
        ) : section === 'claims' ? (
          <ClaimsTab onNewClaim={newClaim} onOpenClaim={openClaim} />
        ) : section === 'benefits' ? (
          <BenefitsTab />
        ) : section === 'loans' ? (
          <LoansTab />
        ) : section === 'extras' ? (
          <ExtrasTab />
        ) : (
          <TaxTab onDeclare={declare} />
        )}
      </View>
    </View>
  );
}

export { PayScreen };
