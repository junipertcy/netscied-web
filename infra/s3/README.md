# netscied.tw bucket policy

`bucket-policy.template.json` lets only CloudFront distribution `E1T4HFQSMO2DUV`
read the bucket (through Origin Access Control), and denies it the files that
were private before the bucket was closed (2026-11-05). The list of those files is in
`../rollback/private-objects.txt`. They are the 2018 site's `.git/`, `.idea/`,
`e2e/` and `uploads/`, old build files and folder markers. Everything that was
public then, including `/greenpeace/jp/`, `/data_taipei/` and `/sensoro/`, is
still served (owner decision 2026-11-05).

Apply with the account id filled in:

    sed "s/<ACCOUNT_ID>/$(aws sts get-caller-identity --query Account --output text)/" \
      infra/s3/bucket-policy.template.json > /tmp/policy.json
    aws s3api put-bucket-policy --bucket netscied.tw --policy file:///tmp/policy.json
