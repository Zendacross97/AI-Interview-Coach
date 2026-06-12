const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.IAM_USER_KEY,
        secretAccessKey: process.env.IAM_USER_SECRET
    }
});

exports.getPresignedUploadUrl = async (filename) => {
    const BUCKET_NAME = process.env.BUCKET_NAME;

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filename,
        ContentType: 'application/pdf',
    });

    try {
        // Generate a URL that expires in 300 seconds (5 minutes)
        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
        
        const s3FileUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${filename}`;

        return { presignedUrl, s3FileUrl };
    } catch (error) {
        throw new Error(`Error generating Presigned URL: ${error.message}`);
    }
};

exports.getResumeBuffer = async (s3Key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: s3Key
        });
        
        const s3Response = await s3Client.send(command);
        const byteArray = await s3Response.Body.transformToByteArray();
        return Buffer.from(byteArray);
    } catch (error) {
        throw new Error(`Error pulling object bytes securely from S3 pipeline: ${error.message}`);
    }
}