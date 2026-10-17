// Package config loads the gateway's typed configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the full gateway configuration.
type Config struct {
	Addr           string
	KafkaBrokers   string
	KafkaTopic     string
	KafkaFromStart bool

	PlatformURL    string
	PlatformAPIKey string
	PollInterval   time.Duration
	Locales        []string

	APIKeys        map[string]string // sha256(key) -> tenant
	DefaultTenant  string
	AllowedOrigins []string

	Window       int
	OnlineTTL    time.Duration
	SampleBudget int
	MaxTenants   int
	ClientBuffer int
	MaxClients   int
}

// FromEnv reads FLEETGW_* variables (KAFKA_BROKERS / KAFKA_TOPIC are shared
// with the simulator and the platform).
func FromEnv(getenv func(string) string) (Config, error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	str := func(k, def string) string {
		if v := strings.TrimSpace(getenv(k)); v != "" {
			return v
		}
		return def
	}
	var errs []error
	num := func(k string, def, lo, hi int) int {
		v := str(k, "")
		if v == "" {
			return def
		}
		n, err := strconv.Atoi(v)
		if err != nil || n < lo || n > hi {
			errs = append(errs, fmt.Errorf("%s must be an integer in [%d, %d]", k, lo, hi))
			return def
		}
		return n
	}
	dur := func(k string, def time.Duration) time.Duration {
		v := str(k, "")
		if v == "" {
			return def
		}
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			errs = append(errs, fmt.Errorf("%s must be a positive duration", k))
			return def
		}
		return d
	}
	c := Config{
		Addr:           str("FLEETGW_ADDR", ":8090"),
		KafkaBrokers:   str("KAFKA_BROKERS", "localhost:29092"),
		KafkaTopic:     str("KAFKA_TOPIC", "fleet.telemetry.v1"),
		KafkaFromStart: str("FLEETGW_KAFKA_START", "end") == "start",
		PlatformURL:    strings.TrimRight(str("FLEETGW_PLATFORM_URL", ""), "/"),
		PlatformAPIKey: str("FLEETGW_PLATFORM_API_KEY", ""),
		PollInterval:   dur("FLEETGW_POLL_INTERVAL", 2*time.Second),
		Locales:        strings.Split(str("FLEETGW_LOCALES", "en,es"), ","),
		DefaultTenant:  str("FLEETGW_DEFAULT_TENANT", "acme-utilities"),
		Window:         num("FLEETGW_WINDOW_SECONDS", 30, 5, 300),
		OnlineTTL:      dur("FLEETGW_ONLINE_TTL", 2*time.Minute),
		SampleBudget:   num("FLEETGW_SAMPLE_BUDGET", 20_000, 100, 10_000_000),
		MaxTenants:     num("FLEETGW_MAX_TENANTS", 32, 1, 10_000),
		ClientBuffer:   num("FLEETGW_CLIENT_BUFFER", 32, 1, 4096),
		MaxClients:     num("FLEETGW_MAX_CLIENTS", 500, 1, 100_000),
		APIKeys:        map[string]string{},
	}
	if v := str("FLEETGW_KAFKA_START", "end"); v != "end" && v != "start" {
		errs = append(errs, errors.New("FLEETGW_KAFKA_START must be end or start"))
	}
	for o := range strings.SplitSeq(str("FLEETGW_ALLOWED_ORIGINS", ""), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, o)
		}
	}
	for pair := range strings.SplitSeq(str("FLEETGW_API_KEYS", ""), ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		tenant, digest, ok := strings.Cut(pair, ":")
		if !ok || tenant == "" || len(digest) != 64 {
			errs = append(errs, errors.New("FLEETGW_API_KEYS entries must be tenant:<sha256 hex>"))
			continue
		}
		c.APIKeys[strings.ToLower(digest)] = tenant
	}
	if c.PlatformURL != "" && c.PlatformAPIKey == "" {
		errs = append(errs, errors.New("FLEETGW_PLATFORM_API_KEY is required with FLEETGW_PLATFORM_URL"))
	}
	return c, errors.Join(errs...)
}
