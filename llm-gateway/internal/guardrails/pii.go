// Package guardrails implements data-protection filters: PII detection and
// redaction with checksum validation, and a heuristic prompt-injection /
// jailbreak scorer. All functions are pure and safe for concurrent use.
package guardrails

import (
	"net/netip"
	"regexp"
	"slices"
	"strings"
)

// PII entity types.
const (
	PIIEmail      = "email"
	PIIPhone      = "phone"
	PIICreditCard = "credit_card"
	PIIIBAN       = "iban"
	PIISSN        = "us_ssn"
	PIIIPAddress  = "ip_address"
)

// AllPIITypes lists every supported entity type in detection order.
var AllPIITypes = []string{PIIEmail, PIIIBAN, PIICreditCard, PIISSN, PIIPhone, PIIIPAddress}

type detector struct {
	typ      string
	re       *regexp.Regexp
	validate func(match string) bool
	// prefilter quickly rejects texts that cannot contain the entity.
	prefilter func(s string) bool
}

var detectors = map[string]detector{
	PIIEmail: {
		typ:       PIIEmail,
		re:        regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,24}`),
		prefilter: func(s string) bool { return strings.IndexByte(s, '@') >= 0 },
	},
	PIIIBAN: {
		typ:       PIIIBAN,
		re:        regexp.MustCompile(`\b[A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]){11,30}\b`),
		validate:  validIBAN,
		prefilter: hasDigit,
	},
	PIICreditCard: {
		typ:       PIICreditCard,
		re:        regexp.MustCompile(`\b(?:[0-9][ \-]?){12,18}[0-9]\b`),
		validate:  validCard,
		prefilter: hasDigit,
	},
	PIISSN: {
		typ:       PIISSN,
		re:        regexp.MustCompile(`\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b`),
		validate:  validSSN,
		prefilter: hasDigit,
	},
	PIIPhone: {
		typ:       PIIPhone,
		re:        regexp.MustCompile(`(?:\+[0-9]{1,3}[ .\-]?)?(?:\([0-9]{1,4}\)[ .\-]?)?[0-9]{2,4}(?:[ .\-]?[0-9]{2,4}){2,4}\b`),
		validate:  validPhone,
		prefilter: hasDigit,
	},
	PIIIPAddress: {
		typ:       PIIIPAddress,
		re:        regexp.MustCompile(`\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b`),
		validate:  validIPv4,
		prefilter: hasDigit,
	},
}

// Findings counts detected entities by type. It never contains raw values.
type Findings map[string]int

// Total returns the number of findings.
func (f Findings) Total() int {
	n := 0
	for _, v := range f {
		n += v
	}
	return n
}

// Merge adds o into f.
func (f Findings) Merge(o Findings) {
	for k, v := range o {
		f[k] += v
	}
}

// PIIScanner detects and redacts a configured subset of entity types.
type PIIScanner struct {
	dets []detector
}

// NewPIIScanner builds a scanner for the given types (nil/empty = all).
func NewPIIScanner(types []string) *PIIScanner {
	if len(types) == 0 {
		types = AllPIITypes
	}
	s := &PIIScanner{}
	for _, t := range AllPIITypes { // keep canonical order: specific before generic
		if slices.Contains(types, t) {
			s.dets = append(s.dets, detectors[t])
		}
	}
	return s
}

// Placeholder returns the redaction token used for an entity type.
func Placeholder(typ string) string { return "[REDACTED:" + strings.ToUpper(typ) + "]" }

// Redact replaces detected entities with placeholders and reports findings.
// When findings is nil the caller is only interested in the text.
func (s *PIIScanner) Redact(text string, findings Findings) string {
	if text == "" {
		return text
	}
	for _, d := range s.dets {
		if d.prefilter != nil && !d.prefilter(text) {
			continue
		}
		text = d.re.ReplaceAllStringFunc(text, func(m string) string {
			if d.validate != nil && !d.validate(m) {
				return m
			}
			if findings != nil {
				findings[d.typ]++
			}
			return Placeholder(d.typ)
		})
	}
	return text
}

// Detect reports findings without modifying the text.
func (s *PIIScanner) Detect(text string) Findings {
	f := Findings{}
	s.Redact(text, f)
	return f
}

func hasDigit(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			return true
		}
	}
	return false
}

func digitsOnly(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			b.WriteByte(s[i])
		}
	}
	return b.String()
}

// Luhn reports whether a digit string passes the Luhn checksum.
func Luhn(digits string) bool {
	if len(digits) < 2 {
		return false
	}
	sum, double := 0, false
	for i := len(digits) - 1; i >= 0; i-- {
		c := digits[i]
		if c < '0' || c > '9' {
			return false
		}
		d := int(c - '0')
		if double {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
		double = !double
	}
	return sum%10 == 0
}

func validCard(m string) bool {
	d := digitsOnly(m)
	if len(d) < 13 || len(d) > 19 {
		return false
	}
	// Reject trivially repeated digits (e.g. 0000 0000 0000 0000).
	if strings.Count(d, d[:1]) == len(d) {
		return false
	}
	return Luhn(d)
}

// ibanLengths holds the official IBAN length per country (subset of the
// SWIFT registry covering EU/EEA and frequent partners).
var ibanLengths = map[string]int{
	"AD": 24, "AE": 23, "AT": 20, "BE": 16, "BG": 22, "BR": 29, "CH": 21, "CY": 28,
	"CZ": 24, "DE": 22, "DK": 18, "EE": 20, "ES": 24, "FI": 18, "FR": 27, "GB": 22,
	"GI": 23, "GR": 27, "HR": 21, "HU": 28, "IE": 22, "IL": 23, "IS": 26, "IT": 27,
	"LI": 21, "LT": 20, "LU": 20, "LV": 21, "MC": 27, "MT": 31, "NL": 18, "NO": 15,
	"PL": 28, "PT": 25, "RO": 24, "SA": 24, "SE": 24, "SI": 19, "SK": 24, "SM": 27,
	"TR": 26, "UA": 29,
}

// ValidIBAN validates an IBAN with country length and ISO 13616 mod-97.
func validIBAN(m string) bool {
	s := strings.ReplaceAll(m, " ", "")
	if len(s) < 15 || len(s) > 34 {
		return false
	}
	if want, ok := ibanLengths[s[:2]]; ok && want != len(s) {
		return false
	}
	rearranged := s[4:] + s[:4]
	rem := 0
	for i := 0; i < len(rearranged); i++ {
		c := rearranged[i]
		switch {
		case c >= '0' && c <= '9':
			rem = (rem*10 + int(c-'0')) % 97
		case c >= 'A' && c <= 'Z':
			v := int(c-'A') + 10
			rem = (rem*100 + v) % 97
		default:
			return false
		}
	}
	return rem == 1
}

// ValidIBAN is exported for tests and evals.
func ValidIBAN(s string) bool { return validIBAN(s) }

func validSSN(m string) bool {
	area, group, serial := m[0:3], m[4:6], m[7:11]
	if area == "000" || area == "666" || area[0] == '9' {
		return false
	}
	return group != "00" && serial != "0000"
}

func validPhone(m string) bool {
	d := digitsOnly(m)
	if len(d) < 10 || len(d) > 15 {
		return false
	}
	// A phone number needs a separator or a leading + to avoid matching
	// arbitrary long numbers such as order IDs or timestamps.
	return strings.HasPrefix(m, "+") || strings.ContainsAny(m, " .-()")
}

func validIPv4(m string) bool {
	a, err := netip.ParseAddr(m)
	return err == nil && a.Is4() && !a.IsUnspecified()
}
