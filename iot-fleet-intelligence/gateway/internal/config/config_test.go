package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDefaults(t *testing.T) {
	c, err := FromEnv(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.Addr != ":8090" || c.KafkaTopic != "fleet.telemetry.v1" || c.KafkaFromStart || c.Window != 30 ||
		c.PollInterval != 2*time.Second || len(c.APIKeys) != 0 || strings.Join(c.Locales, ",") != "en,es" {
		t.Fatalf("defaults: %+v", c)
	}
}

func TestParsesValues(t *testing.T) {
	c, err := FromEnv(env(map[string]string{
		"FLEETGW_KAFKA_START": "start", "FLEETGW_PLATFORM_URL": "http://p:8080/", "FLEETGW_PLATFORM_API_KEY": "k",
		"FLEETGW_API_KEYS":        "acme:" + strings.Repeat("A", 64),
		"FLEETGW_ALLOWED_ORIGINS": "http://a, http://b", "FLEETGW_WINDOW_SECONDS": "60", "FLEETGW_ONLINE_TTL": "5m",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !c.KafkaFromStart || c.PlatformURL != "http://p:8080" || c.APIKeys[strings.Repeat("a", 64)] != "acme" ||
		len(c.AllowedOrigins) != 2 || c.Window != 60 || c.OnlineTTL != 5*time.Minute {
		t.Fatalf("parsed: %+v", c)
	}
}

func TestRejectsInvalid(t *testing.T) {
	_, err := FromEnv(env(map[string]string{
		"FLEETGW_KAFKA_START": "middle", "FLEETGW_WINDOW_SECONDS": "1", "FLEETGW_ONLINE_TTL": "-1s",
		"FLEETGW_API_KEYS": "broken", "FLEETGW_PLATFORM_URL": "http://p",
	}))
	for _, want := range []string{"FLEETGW_KAFKA_START", "FLEETGW_WINDOW_SECONDS", "FLEETGW_ONLINE_TTL", "FLEETGW_API_KEYS", "FLEETGW_PLATFORM_API_KEY"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("expected error about %s, got %v", want, err)
		}
	}
}
