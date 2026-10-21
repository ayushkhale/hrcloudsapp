// ─────────────────────────────────────────────────────────────────────────────
// navigation/AppDrawer.jsx — the slide-in menu behind Home's hamburger.
//
// The tab bar carries five destinations. The app has twenty-four screens. The
// quick-action grid covers six of the rest; this covers all of them, grouped
// exactly as the web sidebar groups them (20-design/03-navigation.md § the
// sidebar → tabs mapping), so somebody who knows the web app finds things
// where they expect.
//
// ── WHY THIS IS NOT @react-navigation/drawer ─────────────────────────────────
//
// That package would mean wrapping the tab navigator in a Drawer.Navigator —
// a new level in the tree that every existing route resolution, the Android
// back chain (RootNavigator's header, steps 1–6) and `backBehavior` would have
// to be re-checked against. This is a panel over the tabs with no navigation
// state of its own: it opens, you pick something, it closes and the existing
// navigator does the navigating. Nothing about the tree changes.
//
// ── IT IS RENDERED BY HomeScreen, AND THAT IS DELIBERATE ─────────────────────
//
// `useGo` dispatches `navigate(tab, { screen })`, which is resolved by the
// nearest navigator that has that tab — the tab navigator. Mounting this at
// the root, above the tabs, would put it OUTSIDE that navigator, where a
// cross-tab jump is a silent no-op. Rendered from Home it sits inside HomeTab's
// stack, the action bubbles up to the tab navigator, and every row works.
//
// ── EVERY ROW GOES THROUGH useRouteTarget ────────────────────────────────────
//
// Not one of them names a tab or a screen (navigation/routes.js). A key with
// no destination in this workspace returns null and THE ROW IS NOT RENDERED —
// and a section whose rows all vanish takes its heading with it, so there is
// never an empty "MY PAY" with nothing under it. Hooks cannot be called in a
// loop over data, so the keys are resolved by name in a fixed order. Twenty
// explicit lines beats a rules-of-hooks violation.
//
// ── THE ORGANISATION HEADER IS A READ THAT IS ALLOWED TO FAIL ────────────────
//
// `/organizations/details` is not on the critical path for anything. If it is
// slow the drawer opens anyway with the name the session already knows; if it
// fails the block falls back to an icon and the app name. A menu that cannot
// open because a logo didn't load is not a trade worth making.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { organizationAPI } from '../api';
import { unwrap } from '../lib/normalize';
import { useAuth } from '../state/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { NAV, TERMS } from '../config/dictionary';
import { icons } from '../theme/icons';
import { color, elevate, font, iconSize, radius, space, text } from '../theme/tokens';
import { useConfirm, useToast } from '../ui';
import { mayaAvailable, openMaya } from '../features/maya/mayaBridge';
import { useGo, useRouteTarget } from './routes';

const LOGO_GREY = require('../assets/brand/logogrey.png');

const WIDTH_FRACTION = 0.86;
const MAX_WIDTH = 340;

/* The sections, in the web sidebar's exact order. `key` is a routes.js key;
   `label` is the destination's title (CLAUDE.md §2).

   ── THE WORDS ARE THE WEB SIDEBAR'S, CHARACTER FOR CHARACTER (2026-10-18) ──
   Group titles are the web's `group("My Time", …)` names, Title Case. Any
   term with one source comes from config/dictionary.js and is never typed
   here: "My Attendance Corrections" is `My ${TERMS.REGULARIZATION}s`, exactly
   as DashboardSidebar builds it — the drawer said "My Corrections" while the
   web said "My Attendance Corrections", two names for one page. */
const SECTIONS = [
  {
    title: null,
    items: [
      { key: 'home', label: 'Dashboard', icon: icons.dashboard },
    ],
  },
  {
    title: 'My Time',
    icon: icons.clock,
    items: [
      { key: 'attendance', label: 'My Attendance', icon: icons.clock },
      { key: 'workLocations', label: 'My Work Locations', icon: icons.location },
      { key: 'leaves', label: 'My Leaves', icon: icons.leave },
      { key: 'corrections', label: `My ${TERMS.REGULARIZATION}s`, icon: icons.edit },
      { key: 'overtime', label: 'My Overtime', icon: icons.overtime },
      { key: 'flags', label: 'My Flags', icon: icons.flag },
      // Never "My Comp-offs" — the UI says Earned Leave (§6), and the word
      // lives in the dictionary so there is one place to change it.
      { key: 'earnedLeave', label: `My ${TERMS.COMP_OFF}`, icon: icons.earnedLeave },
      { key: 'holidays', label: 'Holidays', icon: icons.calendar },
      // Its own tab too; the drawer lists it where the web will (My Time).
      { key: 'schedules', label: 'My Schedules', icon: icons.schedule || icons.calendar },
    ],
  },
  {
    title: 'My Pay',
    icon: icons.rupee,
    items: [
      { key: 'pay', label: 'My Pay', icon: icons.rupee },
      { key: 'salary', label: 'My Salary & Bank', icon: icons.chart },
      { key: 'payslips', label: 'My Payslips', icon: icons.document },
      { key: 'claims', label: 'My Claims & Benefits', icon: icons.claims },
      { key: 'loans', label: 'My Loans & Variable Pay', icon: icons.cash },
      { key: 'tax', label: 'My Tax & Investments', icon: icons.tax },
    ],
  },
  {
    title: 'My Documents',
    icon: icons.folder,
    // Things waiting on the person — documents to acknowledge, requests from
    // HR. It was the Docs tab's badge until Docs moved here (2026-10-22).
    badge: 'inbox',
    items: [
      { key: 'documentsHome', label: 'My Document Home', icon: icons.folder },
      { key: 'documents', label: 'My Personal Documents', icon: icons.folder },
      { key: 'companyDocuments', label: 'My Company Documents', icon: icons.office },
      { key: 'documentRequests', label: 'My Document Requests', icon: icons.clipboard },
      { key: 'forms', label: 'Forms & Templates', icon: icons.attachment },
    ],
  },
  // My Tasks sits BELOW My Documents (user, 2026-10-20) — this is the one
  // place the drawer deliberately departs from the web sidebar's order.
  {
    title: 'My Tasks',
    icon: icons.clipboardCheck,
    items: [
      { key: 'myTasks', label: 'My Tasks', icon: icons.clipboardCheck },
      // The flag, not a warning sign: the Overdue section tile on My Tasks
      // wears the flag, and one destination wears one icon (CLAUDE.md §5).
      { key: 'overdueTasks', label: 'Overdue Tasks', icon: icons.flag },
    ],
  },
  {
    title: 'My Registered Devices',
    icon: icons.device,
    items: [
      // The web's two entries over one page (user, 2026-10-20, reversing the
      // earlier one-row call: a row named the same as its group is noise).
      { key: 'devicesThis', label: 'This device', icon: icons.device },
      { key: 'devicesAll', label: 'All my devices', icon: icons.computer || icons.device },
    ],
  },
  {
    // "Organization" and "Org Profile", not "Company" (user, 2026-10-22).
    title: 'Organization',
    icon: icons.company,
    items: [
      { key: 'orgChart', label: 'Org Chart', icon: icons.orgChart },
      { key: 'company', label: 'Org Profile', icon: icons.company },
      { key: 'directory', label: NAV.DIRECTORY, icon: icons.people },
    ],
  },
  {
    title: 'Account',
    icon: icons.profile,
    items: [
      { key: 'profile', label: 'My Profile', icon: icons.profile },
      { key: 'settings', label: 'Settings', icon: icons.settings },
    ],
  },
];

/* ── The organisation block ───────────────────────────────────────────────── */

const firstOf = (o, ...keys) => {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
};

function extractOrgIdentity(org, user) {
  const d = org?.data ?? org ?? {};
  const orgObj = d.organization || (d.id && !d.profile ? d : {});
  const profile = d.profile || {};

  const name = firstOf(orgObj, 'name', 'organization_name', 'display_name', 'legal_name')
    || firstOf(profile, 'org_name', 'org_alias', 'name')
    || firstOf(d, 'name', 'organization_name', 'display_name')
    || firstOf(user, 'organization_name', 'org_name', 'company_name')
    || 'Your organisation';

  const logoUrl = firstOf(profile, 'logo_url', 'logoUrl', 'logo', 'brand_logo_url')
    || firstOf(orgObj, 'logo_url', 'logoUrl', 'logo', 'brand_logo_url')
    || firstOf(d, 'logo_url', 'logoUrl', 'logo');

  const addressParts = [
    firstOf(profile, 'address_line_1', 'address_line1', 'line1', 'street'),
    firstOf(profile, 'address_line_2', 'address_line2', 'line2'),
    firstOf(profile, 'city', 'district'),
    firstOf(profile, 'state', 'region'),
    firstOf(profile, 'zip_code', 'postal_code', 'pincode', 'zip'),
  ].filter(Boolean);

  const directAddress = firstOf(profile, 'address', 'full_address', 'formatted_address')
    || firstOf(d, 'address', 'full_address', 'formatted_address');

  const address = directAddress
    || (addressParts.length > 0 ? addressParts.join(', ') : null)
    || [firstOf(profile, 'city'), firstOf(profile, 'state')].filter(Boolean).join(', ')
    || firstOf(profile, 'domain', 'industry')
    || firstOf(d, 'domain', 'industry')
    || 'Organization Workspace';

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'O';

  return { name, logoUrl, address, initials };
}

function OrgHeader({ org, user }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const { name, logoUrl, address, initials } = extractOrgIdentity(org, user);
  const logo = !logoFailed && logoUrl ? logoUrl : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingBottom: space[4],
        borderBottomWidth: 1,
        borderBottomColor: color.borderSubtle,
      }}
    >
      {logo ? (
        <Image
          source={{ uri: logo }}
          resizeMode="contain"
          onError={() => setLogoFailed(true)}
          accessibilityRole="image"
          accessibilityLabel={`${name} logo`}
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: color.borderSubtle,
          }}
        />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: color.brandSoftBg,
            borderWidth: 1,
            borderColor: color.brandSoftBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: color.brand }}>
            {initials}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={[text.bodyStrong, { fontSize: 15 }]}>{name}</Text>
        <Text numberOfLines={1} style={[text.caption, { color: color.textSecondary }]}>
          {address}
        </Text>
      </View>
    </View>
  );
}

/* ── Rows & Dropdowns ─────────────────────────────────────────────────────── */

function MenuRow({ label, icon: Icon, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={`Opens ${label}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 46,
        paddingHorizontal: space[4],
        borderRadius: radius.md,
        backgroundColor: pressed ? color.brandSoftBg : 'transparent',
      })}
    >
      {/* Purple, not slate (2026-10-18). A drawer is a column of a dozen
          glyphs; in slate-500 it is a column of grey ticks and nothing in it
          is findable by colour. */}
      {Icon ? <Icon size={iconSize.md} color={color.brandChipFg} /> : null}
      <Text numberOfLines={1} style={[text.body, { flex: 1, color: color.textBody }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SubMenuRow({ label, icon: Icon, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={`Opens ${label}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: 40,
        paddingHorizontal: space[3],
        borderRadius: radius.md,
        backgroundColor: pressed ? color.brandSoftBg : 'transparent',
      })}
    >
      {Icon ? <Icon size={iconSize.sm} color={color.brandChipFg} /> : null}
      <Text numberOfLines={1} style={[text.body, { flex: 1, fontSize: 13.5, color: color.textBody }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DropdownSection({ section, isExpanded, onToggle, onPick, targets, count = 0 }) {
  const Icon = section.icon;
  const Chevron = isExpanded ? icons.chevronUp : icons.chevronDown;

  return (
    <View style={{ marginTop: space[1] }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${section.title}, ${isExpanded ? 'expanded' : 'collapsed'}`}
        accessibilityState={{ expanded: isExpanded }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
          paddingHorizontal: space[4],
          borderRadius: radius.md,
          backgroundColor: pressed ? color.surfaceSubtle : 'transparent',
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flex: 1 }}>
          {Icon ? (
            <Icon size={iconSize.md} color={isExpanded ? color.brand : color.textSecondary} />
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              text.bodyStrong,
              { color: isExpanded ? color.brand : color.textPrimary, fontSize: 14.5 },
            ]}
          >
            {section.title}
          </Text>
          {count > 0 ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                paddingHorizontal: 6,
                borderRadius: radius.full,
                backgroundColor: color.danger.dot,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[text.badge, { color: color.textOnBrand }]}>{count > 99 ? '99+' : count}</Text>
            </View>
          ) : null}
        </View>
        {Chevron ? (
          <Chevron size={16} color={isExpanded ? color.brand : color.textMuted} />
        ) : null}
      </Pressable>

      {isExpanded ? (
        <View
          style={{
            paddingLeft: space[6],
            paddingTop: space[1],
            paddingBottom: space[2],
            gap: 2,
          }}
        >
          {section.items.map((item) => (
            <SubMenuRow
              key={item.key}
              label={item.label}
              icon={item.icon}
              onPress={() => onPick(targets[item.key])}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ── The panel ────────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 */
export function AppDrawer({ open, onClose, inbox = 0 }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const reduced = useReducedMotion();
  const go = useGo();

  const [org, setOrg] = useState(null);
  const [expanded, setExpanded] = useState({
    'My time': true,
    'My pay': false,
    'My documents': false,
    'Organization': false,
    'Account': false,
  });

  const toggleSection = useCallback((title) => {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  }, []);

  // `mounted` keeps the Modal up through the CLOSING animation. Unmounting on
  // `open === false` makes the panel vanish instead of sliding out.
  const [mounted, setMounted] = useState(open);
  const slide = useRef(new Animated.Value(0)).current;

  // Fixed order, every time: a conditional hook is a crash, and these are the
  // destinations the rows above name.
  const targets = {
    home: useRouteTarget('home'),
    attendance: useRouteTarget('attendance'),
    workLocations: useRouteTarget('workLocations'),
    leaves: useRouteTarget('leaves'),
    corrections: useRouteTarget('corrections'),
    overtime: useRouteTarget('overtime'),
    flags: useRouteTarget('flags'),
    earnedLeave: useRouteTarget('earnedLeave'),
    holidays: useRouteTarget('holidays'),
    schedules: useRouteTarget('schedules'),
    myTasks: useRouteTarget('myTasks'),
    overdueTasks: useRouteTarget('overdueTasks'),
    pay: useRouteTarget('pay'),
    salary: useRouteTarget('salary'),
    payslips: useRouteTarget('payslips'),
    claims: useRouteTarget('claims'),
    loans: useRouteTarget('loans'),
    tax: useRouteTarget('tax'),
    documentsHome: useRouteTarget('documentsHome'),
    documents: useRouteTarget('documents'),
    companyDocuments: useRouteTarget('companyDocuments'),
    documentRequests: useRouteTarget('documentRequests'),
    forms: useRouteTarget('forms'),
    devices: useRouteTarget('devices'),
    devicesThis: useRouteTarget('devicesThis'),
    devicesAll: useRouteTarget('devicesAll'),
    company: useRouteTarget('company'),
    orgChart: useRouteTarget('orgChart'),
    directory: useRouteTarget('directory'),
    profile: useRouteTarget('profile'),
    settings: useRouteTarget('settings'),
  };

  // Fetched once the drawer is first opened, not on mount: Home has five
  // requests of its own to get through first, and nobody is looking at this.
  useEffect(() => {
    if (!open || org) return;
    let cancelled = false;
    organizationAPI.getOrganizationDetails()
      .then((res) => { if (!cancelled) setOrg(unwrap(res) || null); })
      .catch((err) => {
        if (__DEV__) console.warn('[AppDrawer] Failed to fetch organization details:', err?.message || err);
      });
    return () => { cancelled = true; };
  }, [open, org]);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: reduced ? 0 : (open ? 260 : 200),
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, slide, reduced]);

  const pick = useCallback((target) => {
    onClose();
    if (!target) return;
    // After the close animation, not during it: navigating mid-slide drops
    // frames on Android and the panel appears to stutter shut.
    setTimeout(() => go(target), reduced ? 0 : 200);
  }, [onClose, go, reduced]);

  const signOut = useCallback(async () => {
    onClose();
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You’ll need to sign in again to clock in or see your pay.',
      confirmText: 'Sign out',
      destructive: true,
      icon: icons.logout,
    });
    if (!ok) return;
    logout();
    showToast('Signed out', 'info');
  }, [onClose, confirm, logout, showToast]);

  if (!mounted) return null;

  // A fraction of the real screen, capped: on a tablet a drawer that keeps
  // growing stops being a drawer.
  const width = Math.min(MAX_WIDTH, Math.round(screenWidth * WIDTH_FRACTION));
  const Logout = icons.logout;

  const sections = SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => targets[i.key]) }))
    .filter((s) => s.items.length);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Scrim: fades smoothly on its own layer without forcing offscreen alpha compositing on the panel */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: color.backdrop,
              opacity: slide,
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close the menu"
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Panel: pure hardware-accelerated translateX */}
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width,
              backgroundColor: color.bg,
              paddingTop: insets.top + space[3],
              transform: [{
                translateX: slide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-width, 0],
                }),
              }],
            },
            elevate('lg'),
          ]}
        >
          {/* ── Organization Info at Top (matches hrcloudsweb) ─────────────── */}
          <OrgHeader org={org} user={user} />

          <ScrollView
            contentContainerStyle={{
              paddingVertical: space[3],
              paddingHorizontal: space[2],
              gap: space[1],
            }}
            showsVerticalScrollIndicator={false}
          >
            {sections.map((section, si) => {
              if (!section.title) {
                return (
                  <View key={`s${si}`} style={{ marginBottom: space[2] }}>
                    {section.items.map((item) => (
                      <MenuRow
                        key={item.key}
                        label={item.label}
                        icon={item.icon}
                        onPress={() => pick(targets[item.key])}
                      />
                    ))}
                  </View>
                );
              }

              return (
                <DropdownSection
                  key={section.title}
                  section={section}
                  isExpanded={!!expanded[section.title]}
                  onToggle={() => toggleSection(section.title)}
                  onPick={pick}
                  targets={targets}
                  count={section.badge === 'inbox' ? inbox : 0}
                />
              );
            })}

            <View style={{ marginTop: space[4], gap: space[2] }}>
              {/* Ask Maya — the sidebar door to the assistant (the others are the
                  floating button and every ⓘ). Not a route, so it opens the panel
                  directly rather than going through the route table.
                  AT THE FOOT, just above Sign out (user, 2026-10-21): Dashboard is
                  the first thing in a menu, and an assistant is where you go when
                  the menu didn't have it. */}
              {mayaAvailable() ? (
                <Pressable
                  onPress={() => { onClose(); setTimeout(openMaya, reduced ? 0 : 200); }}
                  accessibilityRole="button"
                  accessibilityLabel="Ask Maya"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space[3],
                    paddingHorizontal: space[3],
                    paddingVertical: space[3],
                    borderRadius: radius.md,
                    backgroundColor: pressed ? color.brandSoftBorder : color.brandSoftBg,
                  })}
                >
                  <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: color.brandChipBg, alignItems: 'center', justifyContent: 'center' }}>
                    {icons.maya ? <icons.maya size={18} color={color.brandChipFg} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[text.bodyStrong, { color: color.brandSoftFg }]}>Ask Maya</Text>
                    <Text style={[text.caption, { color: color.brandSoftFg }]}>Your HR assistant</Text>
                  </View>
                </Pressable>
              ) : null}

              {/* Sign out */}
              <Pressable
                onPress={signOut}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[3],
                  minHeight: 48,
                  paddingHorizontal: space[4],
                  borderRadius: radius.md,
                  backgroundColor: pressed ? color.danger.bg : 'transparent',
                })}
              >
                {Logout ? <Logout size={iconSize.md} color={color.danger.fg} /> : null}
                <Text style={[text.body, { color: color.danger.fg }]}>Sign out</Text>
              </Pressable>
            </View>
          </ScrollView>

          {/* ── Desaturated Logo & Copyright at the foot ──────────── */}
          <View
            style={{
              paddingHorizontal: space[4],
              paddingTop: space[3],
              paddingBottom: insets.bottom + space[3],
              borderTopWidth: 1,
              borderTopColor: color.borderSubtle,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space[3],
            }}
          >
            <Image
              source={LOGO_GREY}
              style={{ width: 88, height: 28, opacity: 0.7 }}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="HR Clouds"
            />
            <View style={{ justifyContent: 'center', alignItems: 'flex-end', flexShrink: 1 }}>
              <Text
                numberOfLines={1}
                style={[
                  text.caption,
                  {
                    fontSize: 9.5,
                    lineHeight: 13,
                    color: color.textMuted,
                  },
                ]}
              >
                © 2026 All rights reserved,
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  text.caption,
                  {
                    fontSize: 9.5,
                    lineHeight: 13,
                    color: color.textMuted,
                  },
                ]}
              >
                HR Vista Soft Solutions LLP
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The hamburger itself, so Home doesn't hand-roll one. */
export function DrawerButton({ onPress }) {
  const Bars = icons.bars;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open the menu"
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? color.brandSoftBg : color.surface,
        borderWidth: 1,
        borderColor: color.borderSubtle,
        // The same white disc as the bell and every header back button.
        ...elevate('xs'),
      })}
    >
      {Bars ? <Bars size={iconSize.md} color={color.ink} /> : null}
    </Pressable>
  );
}

export default AppDrawer;
