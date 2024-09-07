import { exec, execSync } from "child_process";
import { S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, unlink, statSync } from "fs";
import { filesize } from "filesize";
import { format } from 'date-fns';
import path from "path";
import os from "os";
import { env } from "./env";



const compressFile = async (filePath: string) => {
  console.log("Comprimiendo archivo de respaldo...");

  const compressedFilePath = `${filePath}.zip`;
  const password = env.BACKUP_PASSWORD; // Asegúrate de agregar esta variable de entorno

  if (!password) {
    throw new Error("La contraseña de respaldo no está configurada");
  }

  await new Promise((resolve, reject) => {
    exec(`zip -j -P "${password}" ${compressedFilePath} ${filePath}`, (error, stdout, stderr) => {
      if (error) {
        reject({ error: error, stderr: stderr.trimEnd() });
        return;
      }
      if (stderr) {
        console.log({ stderr: stderr.trimEnd() });
      }
      console.log("Archivo comprimido exitosamente");
      resolve(undefined);
    });
  });

  console.log("Tamaño del archivo de respaldo (comprimido):", filesize(statSync(compressedFilePath).size));
  return compressedFilePath;
}



const uploadToS3 = async ({ name, path }: { name: string, path: string }) => {
  console.log("Uploading backup to S3...");

  const bucket = env.AWS_S3_BUCKET;

  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION
  }

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);
    clientOptions['endpoint'] = env.AWS_S3_ENDPOINT;
  }

  if (env.AWS_S3_FORCE_PATH_STYLE) {
    clientOptions.forcePathStyle = true;
  }

  const client = new S3Client(clientOptions);
  const s3Key = `${name}`;

  console.log("s3Key", s3Key);

  await new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: s3Key,
      Body: createReadStream(path),
    },
  }).done();

  console.log("Backup uploaded to S3...");
}



const dumpToFile = async (filePath: string) => {
  console.log("Dumping DB to file...");

  const pgDumpCommand = env.PG_DUMP_COMMAND || `pg_dump --clean --format=custom`;

  await new Promise((resolve, reject) => {
    exec(`${pgDumpCommand} --dbname=${env.BACKUP_DATABASE_URL} > ${filePath}`, (error, stdout, stderr) => {
      if (error) {
        reject({ error: error, stderr: stderr.trimEnd() });
        return;
      }
      if (stderr != "") {
        console.log({ stderr: stderr.trimEnd() });
      }
      console.log("Backup file is valid");
      console.log("Backup filesize:", filesize(statSync(filePath).size));
      resolve(undefined);
    });
  });

  console.log("DB dumped to file...");
}



const deleteFile = async (path: string) => {
  console.log("Deleting file...");
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      if (err) reject({ error: err });
      resolve(undefined);
    });
  });
}

export const backup = async () => {
  console.log("Initiating DB backup...");

  const date = new Date();
  const formattedDate = format(date, 'yyyy-MM-dd');
  const filename = env.CUSTOM_FILENAME ? env.CUSTOM_FILENAME : `${env.PREFIX}backup-${formattedDate}.dump`;
  const filepath = path.join(os.tmpdir(), filename);

  await dumpToFile(filepath);

  const compressedFilePath = await compressFile(filepath);
  await uploadToS3({ name: `${filename}.gz`, path: compressedFilePath });

  await deleteFile(filepath);
  await deleteFile(compressedFilePath);

  console.log("DB backup complete...");
}
