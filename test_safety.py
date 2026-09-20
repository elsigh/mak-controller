#!/usr/bin/env python3
"""Safety fail-safe tests for the Flask grill command path."""

import os
import tempfile
import unittest
from unittest import mock

_DB_FD, _DB_PATH = tempfile.mkstemp(suffix=".db")
os.close(_DB_FD)
os.environ["DB_PATH"] = _DB_PATH
os.environ["MAK_SKIP_WATCHDOG"] = "1"

import app  # noqa: E402


def _reset():
    app.last_seen_epoch = 0.0
    app.prev_flags = None
    app.flameout_start_epoch = None
    app.flameout_triggered = False
    app.at_set_alerted = False
    app.last_alerted_setpoint = None
    app.logged_online = False
    app.silence_notified_at = 0.0
    app.power_failsafe = None
    app.danger_alerted = False
    app.pending_explicit_power_on = False
    app.grill_command.update({
        "setPoint": 175,
        "potStatus": "",
        "cookMode": 1,
        "zoneProbe": 1,
        "power": 1,
    })
    app.grill_state.update({
        "grill_id": "Unknown",
        "temp": "--",
        "power": "OFF",
        "probe1": "",
        "probe2": "",
        "probe3": "",
        "flags": "",
        "last_seen": "Waiting for data...",
    })


class HelperTests(unittest.TestCase):
    def test_watches_silence_for_on_cool_or_session_not_cold_off(self):
        self.assertTrue(app.should_watch_silence(1, "ON", False))
        self.assertTrue(app.should_watch_silence(1, "COOL", False))
        self.assertTrue(app.should_watch_silence(1, "OFF", True))
        self.assertFalse(app.should_watch_silence(1, "OFF", False))
        self.assertFalse(app.should_watch_silence(0, "ON", True))

    def test_sustained_silence_is_30s(self):
        last = 1_000_000.0
        self.assertFalse(app.is_sustained_silence(last, last + app.SILENCE_THRESHOLD_S - 1))
        self.assertTrue(app.is_sustained_silence(last, last + app.SILENCE_THRESHOLD_S))
        self.assertFalse(app.is_sustained_silence(0, last + app.SILENCE_THRESHOLD_S))

    def test_hold_power_off_after_long_off_gap(self):
        self.assertTrue(app.should_hold_power_off_after_gap(app.SILENCE_THRESHOLD_S, "OFF", False))
        self.assertFalse(app.should_hold_power_off_after_gap(app.SILENCE_THRESHOLD_S - 1, "OFF", False))
        self.assertFalse(app.should_hold_power_off_after_gap(app.SILENCE_THRESHOLD_S, "ON", False))
        self.assertFalse(app.should_hold_power_off_after_gap(app.SILENCE_THRESHOLD_S, "OFF", True))

    def test_danger_tokens_case_insensitive(self):
        self.assertTrue(app.contains_danger_token("FIRE"))
        self.assertTrue(app.contains_danger_token("flameout"))
        self.assertTrue(app.contains_danger_token("FLAME OUT"))
        self.assertTrue(app.contains_danger_token("timeout"))
        self.assertTrue(app.contains_danger_token("TIME OUT"))
        self.assertFalse(app.contains_danger_token("ATSET"))
        self.assertFalse(app.contains_danger_token("ON"))
        self.assertFalse(app.contains_danger_token("0"))


class FailSafeBehaviorTests(unittest.TestCase):
    def setUp(self):
        _reset()
        self.alerts = []
        self.notify_patch = mock.patch.object(
            app,
            "send_push_notification",
            side_effect=lambda title, message, priority="default": self.alerts.append(
                {"title": title, "message": message, "priority": priority}
            ),
        )
        self.notify_patch.start()
        self.client = app.app.test_client()

    def tearDown(self):
        self.notify_patch.stop()

    def test_silence_watchdog_forces_power_zero_and_renotifies(self):
        t0 = 20_000_000.0
        app.process_grill_post({"GrillId": "TEST1", "Temp": "350", "Power": "ON"}, t0)
        app.tick_silence_watchdog(t0 + app.SILENCE_THRESHOLD_S - 1)
        self.assertEqual(app.grill_command["power"], 1)
        self.assertIsNone(app.power_failsafe)

        app.tick_silence_watchdog(t0 + app.SILENCE_THRESHOLD_S)
        self.assertEqual(app.grill_command["power"], 0)
        self.assertEqual(app.power_failsafe, "silence")
        self.assertEqual(len(self.alerts), 1)
        self.assertEqual(self.alerts[0]["title"], "MAK Grill: grill silent / Web Ctrl lost")
        self.assertEqual(self.alerts[0]["priority"], "urgent")

        app.tick_silence_watchdog(t0 + app.SILENCE_THRESHOLD_S + 5)
        self.assertEqual(len(self.alerts), 1)
        app.tick_silence_watchdog(t0 + app.SILENCE_THRESHOLD_S + app.SILENCE_RENOTIFY_S)
        self.assertEqual(len(self.alerts), 2)

    def test_software_flameout_commands_power_zero(self):
        app.grill_command["setPoint"] = 250
        t0 = 21_000_000.0
        t = t0
        while t < t0 + app.FLAMEOUT_DURATION_S:
            body = app.process_grill_post({"GrillId": "TEST1", "Temp": "200", "Power": "ON"}, t)
            self.assertIn("power=1", body)
            self.assertFalse(app.flameout_triggered)
            t += 10

        later = t0 + app.FLAMEOUT_DURATION_S
        body = app.process_grill_post({"GrillId": "TEST1", "Temp": "200", "Power": "ON"}, later)
        self.assertIn("power=0", body)
        self.assertTrue(app.flameout_triggered)
        self.assertEqual(app.power_failsafe, "flameout")
        self.assertTrue(any(a["title"] == "MAK Grill Flameout Warning!" for a in self.alerts))

    def test_unseen_off_grill_is_not_started_with_default_power_one(self):
        body = app.process_grill_post({"GrillId": "TEST1", "Temp": "80", "Power": "OFF"})
        self.assertIn("power=0", body)
        self.assertEqual(app.power_failsafe, "offline-off")

    def test_long_gap_off_is_not_answered_with_power_one(self):
        t0 = 22_000_000.0
        app.process_grill_post({"GrillId": "TEST1", "Temp": "350", "Power": "ON"}, t0)
        self.assertEqual(app.grill_command["power"], 1)

        reconnect = app.process_grill_post(
            {"GrillId": "TEST1", "Temp": "120", "Power": "OFF"},
            t0 + app.SILENCE_THRESHOLD_S,
        )
        self.assertIn("power=0", reconnect)
        self.assertEqual(app.power_failsafe, "offline-off")

        still = app.process_grill_post(
            {"GrillId": "TEST1", "Temp": "90", "Power": "OFF"},
            t0 + app.SILENCE_THRESHOLD_S + 5,
        )
        self.assertIn("power=0", still)

    def test_explicit_power_on_after_long_off_gap(self):
        t0 = 23_000_000.0
        app.process_grill_post({"GrillId": "TEST1", "Temp": "350", "Power": "ON"}, t0)
        app.process_grill_post(
            {"GrillId": "TEST1", "Temp": "90", "Power": "OFF"},
            t0 + app.SILENCE_THRESHOLD_S,
        )
        res = self.client.post("/api/power?state=1")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["success"])

        resume = app.process_grill_post(
            {"GrillId": "TEST1", "Temp": "90", "Power": "OFF"},
            t0 + app.SILENCE_THRESHOLD_S + 5,
        )
        self.assertIn("power=1", resume)
        self.assertIsNone(app.power_failsafe)

    def test_danger_tokens_force_power_zero(self):
        flags_body = app.process_grill_post({
            "GrillId": "TEST1",
            "Temp": "350",
            "Power": "ON",
            "GrillFlags": "FIRE",
        })
        self.assertIn("power=0", flags_body)
        self.assertEqual(app.power_failsafe, "danger")
        self.assertTrue(any(a["title"] == "MAK Grill: danger flag" for a in self.alerts))

        _reset()
        self.alerts.clear()
        power_body = app.process_grill_post({
            "GrillId": "TEST1",
            "Temp": "350",
            "Power": "FLAME OUT",
        })
        self.assertIn("power=0", power_body)
        self.assertEqual(app.grill_command["power"], 0)

    def test_healthy_polls_do_not_false_trip(self):
        app.grill_command["setPoint"] = 350
        t0 = 24_000_000.0
        for i in range(21):
            t = t0 + i * 5
            app.tick_silence_watchdog(t)
            body = app.process_grill_post({"GrillId": "TEST1", "Temp": "348", "Power": "ON"}, t)
            self.assertEqual(
                body,
                '"setPoint=350&potStatus=&cookMode=1&zoneProbe=1&power=1"',
            )
            self.assertEqual(app.grill_command["power"], 1)
            self.assertIsNone(app.power_failsafe)
            self.assertFalse(app.flameout_triggered)
        self.assertEqual(self.alerts, [])

    def test_cool_does_not_undo_failsafe_hold(self):
        t0 = 26_000_000.0
        app.process_grill_post({"GrillId": "TEST1", "Temp": "350", "Power": "ON"}, t0)
        app.tick_silence_watchdog(t0 + app.SILENCE_THRESHOLD_S)
        cool = app.process_grill_post(
            {"GrillId": "TEST1", "Temp": "200", "Power": "COOL"},
            t0 + app.SILENCE_THRESHOLD_S + 5,
        )
        self.assertIn("power=0", cool)
        self.assertEqual(app.grill_command["power"], 0)
        self.assertEqual(app.power_failsafe, "silence")

    def test_http_service_returns_quoted_command(self):
        res = self.client.post("/GrillService/Service", data={
            "GrillId": "TEST1",
            "Temp": "225",
            "Power": "ON",
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_data(as_text=True).startswith('"setPoint='))
        self.assertIn("power=1", res.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
