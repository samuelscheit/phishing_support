import { simpleParser } from "mailparser";
import { writeFileSync } from "fs";
import { join } from "path";
import { extractEmlsFromIncomingMessage } from "../mail_forwarded";
import { cleanPrivateInformation, parseMail } from "../mail_ai";

// extractForwardedText({
// 	text: ``
// })
const mail = await simpleParser(`Return-path: <samuel.scheit@me.com>
Original-recipient: rfc822;samuel.scheit@me.com
Received: from p00-icloudmta-asmtp-us-central-1k-100-percent-4 by p142-mailgateway-smtp-5ffd748cb-gb9dv (mailgateway 2544B77)
	with SMTP id 83678443-dcce-4d19-a682-835a38af158e 
	for <samuel.scheit@me.com>; Tue, 13 Jan 2026 04:35:54 GMT
X-ICLOUD-MAIL-BWL: 1
X-Apple-MoveToFolder: INBOX 
X-Apple-Action: WL/INBOX
X-Apple-UUID: 83678443-dcce-4d19-a682-835a38af158e
Received: from outbound.ci.icloud.com (unknown [127.0.0.2])
	by p00-icloudmta-asmtp-us-central-1k-100-percent-4 (Postfix) with ESMTPS id 55D981804696
	for <samuel.scheit@me.com>; Tue, 13 Jan 2026 04:35:52 +0000 (UTC)
Dkim-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=me.com; s=1a1hai; bh=48BjUnohJAz9WUOdOR47IXw7M5cHcrbN929c9e+uuus=; h=From:Content-Type:Mime-Version:Subject:Message-Id:To:Date:x-icloud-hme; b=IaBsl3YkO/yb2IA9ubqRkFGqOkmhFDNFRsbi3Wp5oN9YYXzgQ0cXLNJgYGxC+g5ZluUeSfVDbSvltjrmb64DiIkno/ZRevCtrq+dprk1bVYAhLwvNp/+iufJwBuJ5fbWPry+kwhGr8pouLR0PRp8yG3wN9VJfe99qyluQdvqc61eUemAZ3AX/lMzietZxOVINaJQVbv1n+Rs76ZSrNotRF3P/SpsNfKJztPolQw6EQ61WBmK1tVWUEROvQKbke5+41fZJxXWqWxHz08wmVT9mTC1vIGxD8gX3y7eRn5l3ULT4tZgOSANNWMw1711vMWRG4DkZJkocc1K1gOtClBEXg==
Received: from smtpclient.apple (unknown [17.57.156.36])
	by p00-icloudmta-asmtp-us-central-1k-100-percent-4 (Postfix) with ESMTPSA id 6171518035D5
	for <samuel.scheit@me.com>; Tue, 13 Jan 2026 04:35:51 +0000 (UTC)
From: Samuel Scheit <samuel.scheit@me.com>
Content-Type: multipart/alternative;
	boundary="Apple-Mail=_423B289D-E950-4B4D-B196-1A2D1196BFD8"
Mime-Version: 1.0 (Mac OS X Mail 16.0 \(3864.300.22\))
Subject: Fwd: test
Message-Id: <D0797730-2DE4-4ECD-A27B-DC09D7B05997@me.com>
References: <dba3eddf-d738-4c10-9d4a-b9a6419a9abd@mtasv.net>
To: Samuel Scheit <samuel.scheit@me.com>
Date: Tue, 13 Jan 2026 05:35:48 +0100
X-Mailer: Apple Mail (2.3864.300.22)
X-CLX-Shades: Ham
X-CLX-UShades: None
X-CLX-Score: 1006
X-CLX-UnSpecialScore: None
X-CLX-Spam: false
X-MANTSH: 1TFkXGxoaHBEKWUQXYBx/bVppE0hbaEARCllNF2JLRxEKWUkXEQpZXhdobnkRCkN
 OF2hjbVhJaU4cSRx6Xx9HWGlEaWdNb0cYRHt4cE8HeGNFEQpYXBcZBBoEHx4FGxoEGxwYBBkaB
 B8QGx4aHxoRCl5ZF01HGWhuEQpMRhdvaGsRCkNaFxsdBB8dBBsfHAQZHBEKQl4XGxEKXk4XGxE
 KQkUXZkMFUEhmfEhIHRoRCkJOF2xwYHlAHWJSaRpiEQpCTBduWUN9Zmt8bWVvbhEKQm4XaxtbR
 RNjG3tLQWwRCkJsF2lQaBt8AXhSHmdCEQpCQBdsXh4eGGkbEmNlUhEKQlgXbllDfWZrfG1lb24
 RCkJ4F2sbW0UTYxt7S0FsEQpFQxcbEQpwZxdjG01iehJoRlhBbhAaEQpwaBdhBX1EWm8bARNBY
 RAaEQpwaBd6U1tJYn5tQh14aBAaEQpwaBdrHkNTZlNyGVoFGBAaEQpwaBdjY3ltZG5QHWcfRRA
 aEQpwaBdrUEBkQFpecGF5UBAaEQpwaBdpWXxCBW5cUBxeZhAaEQpwaBdvGkMaE1tiQhNYQxAaE
 QpwaBdpZxh7ZBMcTnpSXxAaEQpwfxdueRhDf1IaYXlGGxAHGx4RCnBfF2ZhYksBHGl+TG1HEBo
 RCnB9F2dyH2docxp+bx9vEBoRCnB/F2gff2ZAT2FibnhvEAcbGhsRCnBfF2BkHn1oY2JpZ19mE
 BoRCnB9F21JW3sTQmlOeW0bEBoRCnBfF2ZOH3h5EkEFSUlnEBoRCnB9F2QBHWZGG1pYaHAYEBo
 RCnB9F2dyH2docxp+bx9vEBoRCnB9F2QBHWZGG1pYaHAYEBoRCnBsF25+WxN7Gk8ZUkViEBoRC
 nBMF298Uh1CeEQaG3pHEBoRCm1+FxoRClhNF0sR
X-Authority-Info: v=2.4 cv=ZdMQ98VA c=1 sm=1 tr=0 ts=6965cba8
 cx=c_apl:c_apl_out:c_pps a=2G65uMN5HjSv0sBfM2Yj2w==:117
 a=2G65uMN5HjSv0sBfM2Yj2w==:17 a=vUbySO9Y5rIA:10 a=x7bEGLp0ZPQA:10
 a=ZK8waPx9znoA:10 a=VkNPw1HP01LnGYTKEx00:22 a=KsJHGdMNAAAA:8 a=h0mjrt6MAAAA:8
 a=HHGDD-5mAAAA:8 a=zurXxNe0kyJSHhwSbgUA:9 a=QEXdDO2ut3YA:10 a=EuvPuWTFAAAA:8
 a=rQWK30vCpxbAPyhlnSYA:9 a=uxlJbKtGYnKICsBR:21 a=_W_S_7VecoQA:10
 a=xfY-mlha-S8hdVryN-mG:22 a=L2RG-q0aGaQ2j2byieRp:22 a=E0MKEBjsMrQNwMxMWQE4:22
X-Proofpoint-GUID: BIGrcCd6c6Pu5mrCnCMgEm2nQRZe-RIo
X-Proofpoint-Spam-Details-Enc: AW1haW4tMjYwMTEzMDAzNSBTYWx0ZWRfX6u9MmdHBsJNU
 QVPHFaHBIsbITgYM8dygIdXkYa8aDJ864o0uu1HzvegdC5x1toJ0ZU+hrjTRMIWa0LvLlM/FzQX
 H7Od88mCdw/vPFgdTU+gjej8+h4iwOZz40LS06fNdofhXbLSN9NzXqic+EY0bZ3ylGTJ5xcra8d
 +1+Szio7u0i0CCpL5Q1pON24gp9kfYkJ45v9gkq22PTzr/x/WtiBZ4zFwxrO4rcHpy49GCJQ/oO
 QszO1ia5/vN1G/WFCpX48O6fUCc/kgm50gCvnOccOhf+5OphfQTw2E0JZPmxQ3ZSL1+Xnx7/3SO
 Rf1tWJtiKSIZ/5o8XgC
X-Proofpoint-ORIG-GUID: BIGrcCd6c6Pu5mrCnCMgEm2nQRZe-RIo
X-Proofpoint-Virus-Version: vendor=baseguard
 engine=ICAP:2.0.293,Aquarius:18.0.1121,Hydra:6.1.9,FMLib:17.12.100.49
 definitions=2026-01-12_07,2026-01-09_02,2025-10-01_01
X-Proofpoint-Spam-Details: rule=notspam policy=default score=0 mlxscore=0
 clxscore=1006 malwarescore=0 adultscore=0 spamscore=0 phishscore=0
 mlxlogscore=999 suspectscore=0 bulkscore=0 classifier=spam authscore=0
 adjust=0 reason=mlx scancount=1 engine=8.22.0-2510240001
 definitions=main-2601130035
X-JNJ: AAAAAAAB077ifI86Syhu/H+Mjym+UoM804DwFc11vAdr/ZAiSklw7mhWgoAwYpp1gRo1qIfM6pDztV2FPg26Y15o6IY7JAH8j4lSAlBFioMPPi5WXedcPt5umHeDaJWHDrhe9Ux7vkaCK3Awrez260+pakHhMxS+jdDHgcHzznmv1nDcWeuSJMFuFot0kM1yUvXvFhB0puNzGp2VIqEo/hsDAZbVyM4jhTIpVq6ve097gGVXJsIEN1qFROL/a4krykklshPIJGWUCntAoCjjdrIxPa62iUQCeQh4S/aO2pYecppnyBCUBM8TJR2hSVluaYFnXaB7biU1CTj8iJdT57ivducFDzcqSSZiu3gbNQU+Z8wj+8PDKEmsQn4eGrCY4EsLIL2rTlpSu6ffPJDmzSlWF0mZNlAIi5lSEVWRNcikvPqnPFlTm5e/NeaFFMVcuS06s9y4FkNPPCRu4E2FnnM6ciYxFsjxUqtqMsm/awzfWw4TOAkqRziMh3DyKXHJwK3cDvFLfOmmDnak1qOeQ6/mZI2L9ISKxuVHGmtTF9ByXZO5vM2yjKsf/w0UoKjWH+5/4f6fg3eENeOoIPXOuE46S7I=


--Apple-Mail=_423B289D-E950-4B4D-B196-1A2D1196BFD8
Content-Transfer-Encoding: quoted-printable
Content-Type: text/plain;
	charset=utf-8



> Begin forwarded message:
>=20
> From: Veranstaltungen Nockherberg <Veranstaltungen@nockherberg.com>
> Subject: Ihre Tickets f=C3=BCr Di., 17.03.2026, 16:00-22:30Uhr
> Date: 3. January 2026 at 21:04:00 GMT+1
> To: samuel.scheit@me.com
>=20
>=20
>=20
> Hallo Samuel Scheit,
>=20
> Schottenhamel und Lechner GmbH hat Sie eingeladen an Di., 17.03.2026, =
16:00-22:30Uhr teilzunehmen. Anbei finden Sie Ihre Tickets.
>=20
> Ihre Tickets
>=20
> Einlassticket 2
> Ticket anzeigen =
<https://vivenu.com/ticket/6959763045928bc53b64314b/681ccfe5-2042-47a8-822=
1-10549c7d30ef>
> Event
>=20
> =09
> Di., 17.03.2026, 16:00-22:30Uhr=20
>=20
> 17.03.2026 16:00 CET - 17.03.2026 22:30 CET
> Paulaner am Nockherberg
> Hochstr. 77 M=C3=BCnchen 81541
> Diese Email wurde im Auftrag von Schottenhamel und Lechner GmbH =
verschickt.
>=20


--Apple-Mail=_423B289D-E950-4B4D-B196-1A2D1196BFD8
Content-Transfer-Encoding: quoted-printable
Content-Type: text/html;
	charset=utf-8

<html aria-label=3D"message body"><head><meta http-equiv=3D"content-type" =
content=3D"text/html; charset=3Dutf-8"></head><body =
style=3D"overflow-wrap: break-word; -webkit-nbsp-mode: space; =
line-break: after-white-space;"><br id=3D"lineBreakAtBeginningOfMessage">
<div><br><blockquote type=3D"cite"><div>Begin forwarded =
message:</div><br class=3D"Apple-interchange-newline"><div =
style=3D"margin-top: 0px; margin-right: 0px; margin-bottom: 0px; =
margin-left: 0px;"><span style=3D"font-family: -webkit-system-font, =
Helvetica Neue, Helvetica, sans-serif; color:rgba(0, 0, 0, =
1.0);"><b>From: </b></span><span style=3D"font-family: =
-webkit-system-font, Helvetica Neue, Helvetica, =
sans-serif;">Veranstaltungen Nockherberg =
&lt;Veranstaltungen@nockherberg.com&gt;<br></span></div><div =
style=3D"margin-top: 0px; margin-right: 0px; margin-bottom: 0px; =
margin-left: 0px;"><span style=3D"font-family: -webkit-system-font, =
Helvetica Neue, Helvetica, sans-serif; color:rgba(0, 0, 0, =
1.0);"><b>Subject: </b></span><span style=3D"font-family: =
-webkit-system-font, Helvetica Neue, Helvetica, sans-serif;"><b>Ihre =
Tickets f=C3=BCr Di., 17.03.2026, =
16:00-22:30Uhr</b><br></span></div><div style=3D"margin-top: 0px; =
margin-right: 0px; margin-bottom: 0px; margin-left: 0px;"><span =
style=3D"font-family: -webkit-system-font, Helvetica Neue, Helvetica, =
sans-serif; color:rgba(0, 0, 0, 1.0);"><b>Date: </b></span><span =
style=3D"font-family: -webkit-system-font, Helvetica Neue, Helvetica, =
sans-serif;">3. January 2026 at 21:04:00 GMT+1<br></span></div><div =
style=3D"margin-top: 0px; margin-right: 0px; margin-bottom: 0px; =
margin-left: 0px;"><span style=3D"font-family: -webkit-system-font, =
Helvetica Neue, Helvetica, sans-serif; color:rgba(0, 0, 0, 1.0);"><b>To: =
</b></span><span style=3D"font-family: -webkit-system-font, Helvetica =
Neue, Helvetica, =
sans-serif;">samuel.scheit@me.com<br></span></div><br><div><meta =
charset=3D"UTF-8"><table class=3D"email-wrapper" width=3D"100%" =
cellpadding=3D"0" cellspacing=3D"0" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; width: 1339px; margin: 0px; padding: 0px; background-color: =
rgb(242, 244, 246); caret-color: rgb(116, 120, 126); color: rgb(116, =
120, 126); font-size: 12px; font-style: normal; font-variant-caps: =
normal; font-weight: 400; letter-spacing: normal; orphans: 2; =
text-align: start; text-transform: none; white-space: normal; widows: 2; =
word-spacing: 0px; -webkit-text-stroke-width: 0px; text-decoration-line: =
none; text-decoration-thickness: auto; text-decoration-style: =
solid;"><tbody style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, =
Helvetica, sans-serif; box-sizing: border-box;"><tr><td align=3D"center" =
style=3D"word-break: break-word; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;"><table =
class=3D"email-content" width=3D"100%" cellpadding=3D"0" cellspacing=3D"0"=
 style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box; width: 1339px; margin: 0px; padding: =
0px;"><tbody style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, =
Helvetica, sans-serif; box-sizing: border-box;"><tr><td =
class=3D"email-body" width=3D"100%" cellpadding=3D"0" cellspacing=3D"0" =
style=3D"word-break: break-word; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box; width: =
1339px; margin: 0px; padding: 0px; background-color: rgb(242, 244, =
246);"><table class=3D"email-body_inner" align=3D"center" width=3D"570" =
cellpadding=3D"0" cellspacing=3D"0" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; width: 670px; margin: 0px auto; padding: 0px; =
background-color: rgb(255, 255, 255); border-top-width: 4px; =
border-top-style: solid; border-top-color: rgb(0, 0, 0);"><tbody =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><tr class=3D"content-cell" =
style=3D"padding: 35px;"><td style=3D"word-break: break-word; =
font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; =
box-sizing: border-box;"><img =
src=3D"https://s3.eu-central-1.amazonaws.com/yt-s3/ebe4fffe-5e5b-448f-8ce4=
-c0a1f29fa8f1.png" alt=3D"logo" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; max-height: 53px;"></td></tr><tr><td style=3D"word-break: =
break-word; font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><div class=3D"lead_image" =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box; margin-top: 30px; width: =
670px;"><img =
src=3D"https://s3.eu-central-1.amazonaws.com/yt-s3/29d416f4-6896-4077-9c4d=
-d9f0757fa3b7.jpg" width=3D"100%" alt=3D"Placeholder" =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box; width: 670px; height: auto; =
max-width: 100%;"></div></td></tr><tr><td class=3D"content-cell" =
style=3D"word-break: break-word; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box; padding: =
35px;"><h2 style=3D"margin-top: 0px; color: rgb(47, 49, 51); font-size: =
16px; font-weight: bold; text-align: left; font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box;">Hallo Samuel Scheit,</h2><p style=3D"line-height: 1.5em; =
text-align: left; margin-top: 0px; color: rgb(116, 120, 126); font-size: =
16px; font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;">Schottenhamel und Lechner GmbH hat =
Sie eingeladen an Di., 17.03.2026, 16:00-22:30Uhr teilzunehmen. Anbei =
finden Sie Ihre Tickets.</p><table class=3D"purchase" width=3D"100%" =
cellpadding=3D"0" cellspacing=3D"0" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; width: 600px; margin: 0px; padding-bottom: 30px;"><tbody =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><tr><td colspan=3D"2" =
style=3D"word-break: break-word; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;"><h2 =
style=3D"margin-top: 0px; color: rgb(47, 49, 51); font-size: 16px; =
font-weight: bold; text-align: left; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;">Ihre =
Tickets</h2><table class=3D"purchase_content_small_padding_both" =
width=3D"100%" cellpadding=3D"0" cellspacing=3D"0" style=3D"font-family: =
Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; width: 600px; margin: 0px; padding: 10px 0px;"><tbody =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><tr><td width=3D"100%" =
class=3D"purchase_item" style=3D"word-break: break-word; font-family: =
Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; padding: 10px 5px; color: rgb(116, 120, 126); font-size: =
15px; line-height: 18px;"><strong style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box;">Einlassticket 2</strong></td></tr><tr><td width=3D"100%" =
class=3D"purchase_item_link" style=3D"word-break: break-word; =
font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; =
box-sizing: border-box; font-size: 14px; font-weight: 600; margin-top: =
8px;"><a =
href=3D"https://vivenu.com/ticket/6959763045928bc53b64314b/681ccfe5-2042-4=
7a8-8221-10549c7d30ef" class=3D"button__grey" target=3D"_blank" =
style=3D"color: rgb(47, 49, 51) !important; font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; background-color: rgb(248, 248, 248); border-width: 10px =
18px; border-style: solid; border-color: rgb(248, 248, 248); display: =
inline-block; text-decoration: none; border-radius: 3px; box-shadow: =
rgba(0, 0, 0, 0.16) 0px 2px 3px;"><span style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; color: rgb(47, 49, 51);"><font style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; color: rgb(47, 49, 51);">Ticket =
anzeigen</font></span></a></td></tr></tbody></table></td></tr></tbody></ta=
ble><table width=3D"100%" cellpadding=3D"0" cellspacing=3D"0" =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><tbody style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box;"><tr><td style=3D"word-break: break-word; font-family: =
Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box;"><h2 style=3D"margin-top: 0px; color: rgb(47, 49, 51); =
font-size: 16px; font-weight: bold; text-align: left; font-family: =
Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box;">Event</h2></td></tr><tr><td style=3D"word-break: =
break-word; font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><table class=3D"event-info-box" =
width=3D"100%" cellpadding=3D"0" cellspacing=3D"0" style=3D"font-family: =
Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; max-width: 100%; width: 550px; border-radius: 4px; =
background: rgb(248, 248, 248); margin-bottom: 20px;"><tbody =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><tr><td =
class=3D"event-info-box-inner" style=3D"word-break: break-word; =
font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; =
box-sizing: border-box; padding: 12px;"><table width=3D"100%" =
cellpadding=3D"0" cellspacing=3D"0" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box;"><tbody style=3D"font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;"><tr><td =
class=3D"event-info-box-cell" valign=3D"top" width=3D"30%" =
style=3D"word-break: break-word; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box; =
padding-right: 12px;"><img =
src=3D"https://s3.eu-central-1.amazonaws.com/yt-s3/29d416f4-6896-4077-9c4d=
-d9f0757fa3b7.jpg" alt=3D"Di., 17.03.2026, 16:00-22:30Uhr " =
class=3D"responsive-img" width=3D"100%" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; max-width: 100%; border-radius: 4px;"></td><td =
class=3D"event-info-box-cell" valign=3D"top" width=3D"70%" =
style=3D"word-break: break-word; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box; =
padding-right: 12px;"><p style=3D"line-height: 1.5em; text-align: left; =
margin: 0px 0px 8px; color: rgb(116, 120, 126); font-size: 16px; =
font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; =
box-sizing: border-box;"><b style=3D"font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;">Di., =
17.03.2026, 16:00-22:30Uhr<span =
class=3D"Apple-converted-space">&nbsp;</span></b></p><div =
style=3D"line-height: 1.5em; text-align: left; margin: 0px; color: =
rgb(116, 120, 126); font-size: 16px; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;"><small =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;">17.03.2026 16:00 CET - 17.03.2026 =
22:30 CET</small></div><div style=3D"line-height: 1.5em; text-align: =
left; margin: 0px; color: rgb(116, 120, 126); font-size: 16px; =
font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; =
box-sizing: border-box;">Paulaner am Nockherberg</div><div =
style=3D"line-height: 1.5em; text-align: left; margin: 0px; color: =
rgb(116, 120, 126); font-size: 16px; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;">Hochstr. 77 =
M=C3=BCnchen =
81541</div></td></tr></tbody></table></td></tr></tbody></table></td></tr><=
/tbody></table><table class=3D"body-sub" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; margin-top: 25px; padding-top: 25px; border-top-width: 1px; =
border-top-style: solid; border-top-color: rgb(237, 239, 242);"><tbody =
style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><tr><td style=3D"word-break: =
break-word; font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box;"><p class=3D"sub" =
style=3D"line-height: 1.5em; text-align: left; margin-top: 0px; color: =
rgb(116, 120, 126); font-size: 12px; font-family: Arial, &quot;Helvetica =
Neue&quot;, Helvetica, sans-serif; box-sizing: border-box;">Diese Email =
wurde im Auftrag von Schottenhamel und Lechner GmbH =
verschickt.</p></td></tr></tbody></table></td></tr></tbody></table></td></=
tr><tr><td style=3D"word-break: break-word; font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box;"><table class=3D"email-footer" align=3D"center" width=3D"570" =
cellpadding=3D"0" cellspacing=3D"0" style=3D"font-family: Arial, =
&quot;Helvetica Neue&quot;, Helvetica, sans-serif; box-sizing: =
border-box; width: 670px; margin: 0px auto; padding: 0px; text-align: =
center;"><tbody style=3D"font-family: Arial, &quot;Helvetica Neue&quot;, =
Helvetica, sans-serif; box-sizing: border-box;"><tr><td =
class=3D"content-cell-footer" align=3D"center" style=3D"word-break: =
break-word; font-family: Arial, &quot;Helvetica Neue&quot;, Helvetica, =
sans-serif; box-sizing: border-box; padding: =
10px;"></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbo=
dy></table></div></blockquote></div><br></body></html>=

--Apple-Mail=_423B289D-E950-4B4D-B196-1A2D1196BFD8--
  `);

const result = await extractEmlsFromIncomingMessage(mail, "report@phishing.support");
const parsed = cleanPrivateInformation(await parseMail(result[0]));

if (!parsed.html) throw new Error("Expected synthesized message to have HTML");

// console.log(result[0]);
console.dir(parsed, { depth: null });

writeFileSync(join(__dirname, "test.html"), parsed.html || "");
