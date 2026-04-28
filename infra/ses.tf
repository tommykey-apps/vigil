data "aws_route53_zone" "root" {
  name         = "tommykeyapp.com."
  private_zone = false
}

resource "aws_ses_domain_identity" "vigil" {
  domain = var.domain # vigil.tommykeyapp.com
}

resource "aws_ses_domain_dkim" "vigil" {
  domain = aws_ses_domain_identity.vigil.domain
}

# Easy DKIM CNAME 3 本
resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "${aws_ses_domain_dkim.vigil.dkim_tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.vigil.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SPF (subdomain 専用 TXT、root の SPF とは独立)
resource "aws_route53_record" "spf" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com -all"]
}

# DMARC
resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=quarantine; rua=mailto:dmarc@tommykeyapp.com; fo=1"]
}

# DKIM CNAME 反映後に SES の verification 完了を待つ (apply 中ブロック)
resource "aws_ses_domain_identity_verification" "vigil" {
  domain     = aws_ses_domain_identity.vigil.id
  depends_on = [aws_route53_record.dkim, aws_route53_record.spf]
}
