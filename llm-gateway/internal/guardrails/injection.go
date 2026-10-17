package guardrails

import (
	"regexp"
	"strings"
	"unicode"
)

// InjectionResult is the outcome of scoring a text for prompt injection.
type InjectionResult struct {
	Score float64  // 0..1, noisy-OR of matched rule weights
	Rules []string // names of matched rules (no content)
}

type injectionRule struct {
	name   string
	weight float64
	re     *regexp.Regexp
}

// The rules are intentionally conservative: each one describes an intent
// ("override prior instructions", "exfiltrate the system prompt") rather than
// a single keyword, so benign texts that merely contain words like "ignore"
// score low. Weights are combined with a noisy-OR so that several weak
// signals can add up to a block.
var injectionRules = []injectionRule{
	{"override_instructions", 0.85, regexp.MustCompile(`\b(ignore|disregard|forget|override|skip)\b[^.\n]{0,40}\b(all|any|the|your|previous|prior|above|earlier|preceding|initial|original)\b[^.\n]{0,30}\b(instructions?|prompts?|rules|directions|guidelines|directives)\b`)},
	{"exfiltrate_system_prompt", 0.75, regexp.MustCompile(`\b(reveal|show|print|repeat|output|leak|display|dump|tell me|what (is|are|was|were))\b[^.\n]{0,40}\b(system prompt|system message|hidden (prompt|instructions)|initial (prompt|instructions)|your (instructions|prompt|rules)|developer message)\b`)},
	{"jailbreak_persona", 0.6, regexp.MustCompile(`\b(dan|do anything now|developer mode|jailbreak|jailbroken|god mode|unfiltered mode|evil confidant|aim mode)\b`)},
	{"no_restrictions", 0.5, regexp.MustCompile(`\b(without|no|free of|free from)\b (any )?(restrictions|filters|limitations|guidelines|censorship|rules)\b`)},
	{"bypass_safety", 0.6, regexp.MustCompile(`\b(bypass|disable|turn off|deactivate|circumvent|ignore)\b[^.\n]{0,25}\b(safety|guardrails?|filters?|content polic(y|ies)|moderation|restrictions)\b`)},
	{"role_override", 0.4, regexp.MustCompile(`\b(you are now|you are no longer|from now on,? you|pretend (to be|you are)|act as if you)\b`)},
	{"delimiter_spoofing", 0.6, regexp.MustCompile(`(</?system>|\[/?inst\]|<\|im_(start|end)\|>|<\|(system|assistant)\|>|#{2,}\s*(system|instruction)s?\b|\bbegin system prompt\b)`)},
	{"new_instructions", 0.5, regexp.MustCompile(`\b(new|updated|real|actual|true) (system )?(instructions?|rules|directives?)\s*(:|are\b)`)},
	{"encoded_payload", 0.3, regexp.MustCompile(`[A-Za-z0-9+/]{200,}={0,2}`)},
}

var leet = strings.NewReplacer("0", "o", "1", "i", "3", "e", "4", "a", "5", "s", "7", "t", "@", "a", "$", "s")

// normalize lowercases, strips zero-width and control characters and
// collapses whitespace to defeat trivial obfuscation.
func normalize(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	space := false
	for _, r := range s {
		switch {
		case r == 0x200b || r == 0x200c || r == 0x200d || r == 0x2060 || r == 0xfeff || r == 0x00ad:
			continue
		case unicode.IsSpace(r):
			if !space {
				b.WriteByte(' ')
				space = true
			}
			continue
		case unicode.IsControl(r):
			continue
		}
		space = false
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

// ScoreInjection scores text with the heuristic rule set.
func ScoreInjection(text string) InjectionResult {
	if strings.TrimSpace(text) == "" {
		return InjectionResult{}
	}
	norm := normalize(text)
	deleet := leet.Replace(norm)
	keep := 1.0
	var matched []string
	for _, r := range injectionRules {
		target := norm
		if r.name == "encoded_payload" {
			target = text // base64 is case-sensitive
		}
		if r.re.MatchString(target) || (r.name != "encoded_payload" && deleet != norm && r.re.MatchString(deleet)) {
			keep *= 1 - r.weight
			matched = append(matched, r.name)
		}
	}
	return InjectionResult{Score: 1 - keep, Rules: matched}
}
